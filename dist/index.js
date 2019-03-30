let request = require('~/utils/request').default;

const baseLoadingConfig = {
  isNeedLoadingShow: true
}

const api = {
  // 客服聊天历史记录接口（分页）
  GHIMGetHistoryMessages: (params) => {
    return request.get('/IM/GetHistoryMessages',{
      params: params
    })
  },
  // 客服聊天历史记录接口（全量）
  GHIMGetAllHistoryMessages: (params) => {
    return request.get('/IM/GetAllHistoryMessages',{
      params: params
    })
  },
  // 客服聊天对象列表接口(客服端调用)
  GHIMGetTalkers: (params) => {
    return request.get('/IM/GetTalkers', {
      params: params
    })
  },
  // 客服聊天设置消息已读接口（全端都需调用）
  GHIMSetMessagesReaded: (params) => {
    return request.get('/IM/SetMessagesReaded',{
      params: params
    })
  },
  // 客服聊天翻译内容接口(客服端调用)
  GHIMTranslateContent: (params) => {
    return request.get('/IM/TranslateContent',{
      params: params
    })
  },

  // 客服聊天获取客服信息接口 （主要前台用于获取客服的lastMsg）
  GHIMGetMallTalkerInfo: (params) => {
    return request.get('/IM/GetMallTalkerInfo',{
      params: params
    })
  },

  // 设置当前对话中，我的语种，对方的语种
  GHIMSetDialogueLanguage: (params) => {
    return request.get('/IM/SetDialogueLanguage',{
      params: params
    })
  },

  // 获取客服账号
  GHSysGetSupportStaff: (params) => {
    return request.get('/Sys/GetSupportStaff',{
      params: params
    })
  },
}

export default class csManager{
  constructor(options){
    this.api = api;  //调用的api
    this.options = options;  //配置项
    this.mode = options.mode || 'buyer';  //buyer为采购商模式，servicer为客服模式
    this.curTalker = {
      userName:'',
      lastMessage: {
        dialogueID: 0
      }
    };  //当前聊天对象
    this.msgList = [];   //当前消息列表
    this.msgCacheObj = {};   //所有的消息列表缓存，存储聊天列表对象在当前窗口产生的历史纪录.包括发送消息、接受消息。
    this.dialogueId = 0;  //当前对话Id
    this.isLoaded = false;  //IM是否初始化完成
    this.postMsgTxt = '';  //当前输入文本消息
    this.firstTimeDate = this.dataFormat(new Date(),'yyyy-MM-dd hh:mm'); //第一次进来系统消息时间
    this.isCustomerServicerRole = false;  //用户身份是否为客服

    this.isTagReload = true;  //重新渲染

    this.init();   //初始化函数
  }

  async init(){
    const that = this;

    if(that.mode == 'buyer'){
      await that.setDialogLanguage({mylang: 'en', talkerlang: 'zh'});
      await that.loadTalkerInfo();
    }else{
      await that.setDialogLanguage({mylang: 'zh', talkerlang: 'en'});
      await that.loadCustomerAccountInfo();
      await that.loadTalkerListData();
    }

  }

  //接受信息处理
  async doReceiveMessage(res, callback){
    const that = this;

    console.log(res)

    if(!(res instanceof Array) || res.length <= 0){
      return false;
    }

    if(res.length > 1){
      // 大于1时，为系统把所有未读消息（包含所有人）全部推送过来
      res.map(function (item, index) {
        if(that.msgCacheObj[item.dialogueID] instanceof Array){
          if(item.relationID === 0){
            that.msgCacheObj[item.dialogueID].push(item);
          }
        }else {
          that.msgCacheObj[item.dialogueID] = [];
          if(item.relationID === 0){
            that.msgCacheObj[item.dialogueID].push(item);
          }
        }
      })

      that.doSetMessageRead();
    }else{
      // 等于1时，为把某个人的消息推送过来
      var lastMsg = res[0];

      if(lastMsg.relationID !== 0){
        return false;
      }
      // messageType为1时，为用户消息
      if(lastMsg.messageType == 1){

        //如果这条消息接收者是采购商，且与对方的对话ID为0.识别为未登录的第一次聊天用户。
        var fromDialogID = (this.mode == 'buyer' && that.curTalker.dialogueID === 0) ? 0 : lastMsg.dialogueID;

        //如果这条消息是来自一个不在聊天列表当中的新对象,仅仅在客服端
        if(this.mode == 'servicer'){
          let isHaveDialogID = false;
          that.talkerList.map(function(item){
            if(item.dialogueID == fromDialogID){
              isHaveDialogID = true;
            }
          })
          if(!isHaveDialogID){
            that.isTagReload = false;
            that.msgCacheObj[fromDialogID] = [];
            //调用获取单独对象列表，并把他插入talkerList中去
            let listData = {
              userID: lastMsg.fromUserID,
              userName: lastMsg.fromUserName,
              nickName: lastMsg.fromUserName,
              dialogueID: lastMsg.dialogueID,
              lastMessage: lastMsg,
              connectionId: null,
              avatar: '',
              isUnread: false
            }

            that.talkerList.unshift(listData);
            setTimeout(function () {
              that.isTagReload = true;
            },100)
          }
        }

        that.msgCacheObj[fromDialogID].push(lastMsg);

        //新消息来自当前用户
        if(fromDialogID == that.curTalker.dialogueID){
          that.msgList = that.msgCacheObj[fromDialogID];
          that.doSetMessageRead();
        }

        if(this.mode == 'servicer') {
          that.talkerList.map(function (item, index) {
            //新消息来时，在聊天列表且不是当前的聊天对象，显示新消息提醒。
            if (item.dialogueID == fromDialogID && fromDialogID != that.curTalker.dialogueID) {
              item.isUnread = true;
            }
            //新消息来时，更新聊天时间。
            if (item.dialogueID == fromDialogID) {
              item.lastMessage.createTime = lastMsg.createTime ? lastMsg.createTime.substr(0, 16) : '';
            }
          })
        }

        callback && callback('messageUser');
      }
      // messageType为21时，为系统消息
      if(lastMsg.messageType == 21){
        if(lastMsg.fromDialogID == that.curTalker.dialogueID){
          callback && callback('messageSystem');
        }
      }
    }
  }

  //发送聊天消息处理
  doSendMessage(vue){
    const that = this;

    let lastMsg = that.curTalker.lastMessage;
    var toUserID = that.curTalker.userID;
    var toDialogID =  lastMsg ? that.curTalker.dialogueID : 0;

    vue.$store.commit('msgDoSendMessage', {
      type: that.options.dialogType,
      relationId: 0,
      toUserId: toUserID,
      dialogueId: toDialogID,
      msg: that.postMsgTxt
    });

    let msgBlock = {
      createTime: that.dataFormat(new Date(),'yyyy-MM-dd hh:mm'),
      content: that.postMsgTxt,
      fromUserID: this.mode == 'servicer' ? vue.$store.getters.loginInfo.userID : 0,
      fromUserName: this.mode == 'servicer' ? vue.$store.getters.loginInfo.userName : '',
    };

    that.msgCacheObj[toDialogID].push(msgBlock);
    that.msgList = that.msgCacheObj[toDialogID];
    that.postMsgTxt = '';
  }

  //切换当前聊天对象(客服端)
  doSwitchCurTalker(item, tIndex){
    const that = this;
    that.curTalker = item;
    that.msgList = that.msgCacheObj[that.curTalker.dialogueID];

    if(item.isUnread) {
      //点击这行，有未读消息。那么将标记设为已读。处理talkerList排序
      item.isUnread = false;

      var curIndex = tIndex;
      if (curIndex == 0) {
        return;
      }
      var cacheItem = that.talkerList[0];
      that.talkerList[0] = that.talkerList[curIndex];
      that.talkerList[curIndex] = cacheItem;
    }
    // 调用设置消息已读
    that.doSetMessageRead();
  }

  //加载聊天对象列表(客服端)
  async loadTalkerListData(){
    const that = this;

    await this.api.GHIMGetTalkers({}).then(function (res) {
      if(res.isCompleted){
        let rData = res.data;
        let curIndex = 0;

        that.talkerList = rData.map(function (item, index) {
          item.isUnread = false;
          item.dialogueID = item.lastMessage.dialogueID
          return item;
        });

        if(that.talkerList <= 0){
          return false;
        }

        that.curTalker = that.talkerList[curIndex];

        // 如果有未读消息列表
        if(that.msgCacheObj[that.curTalker.dialogueID] && that.msgCacheObj[that.curTalker.dialogueID].length > 0){
          that.msgList = that.msgCacheObj[that.curTalker.dialogueID].concat(that.msgList); //拼接未读消息
          that.doSetMessageRead(); //设置已读
          that.talkerList.map(function (item, index) {
            if(item.dialogueID == that.curTalker.dialogueID){
              return;
            }
            that.msgCacheObj[item.dialogueID] = item.lastMessage ? [item.lastMessage] : [];
          })
        }else{
          // 如果没有未读消息列表
          that.talkerList.map(function (item, index) {
            that.msgCacheObj[item.dialogueID] = item.lastMessage ? [item.lastMessage] : [];
          })
          that.curTalker.lastMessage && that.msgList.push(that.curTalker.lastMessage);  //取最近一条数据
        }
      }
    })

    that.isLoaded = true;
  }

  //加载聊天对象信息（采购商端）
  async loadTalkerInfo(){
    const that = this;

    that.api.GHIMGetMallTalkerInfo({}).then(function (res) {
      if(res.isCompleted) {
        that.curTalker = res.data;
        let lastMsg = that.curTalker.lastMessage;
        that.curTalker.dialogueID = lastMsg ? lastMsg.dialogueID : 0;
        let toDialogueID = that.curTalker.dialogueID;

        if(Object.prototype.toString.call(that.msgCacheObj[toDialogueID]) != "[object Array]" ){
          that.msgCacheObj[toDialogueID] = [];
        }

        // 如果有未读消息列表
        if(that.msgCacheObj[toDialogueID] && that.msgCacheObj[toDialogueID].length > 0){
          that.msgList = that.msgCacheObj[toDialogueID].concat(that.msgList); //拼接未读消息
          that.doSetMessageRead(); //设置已读
        }else{
          //取最新一条数据
          if(lastMsg){
            that.msgCacheObj[toDialogueID].push(lastMsg);
            that.msgList = that.msgCacheObj[toDialogueID];
          }
        }
        that.loadTalkerAllHistoryListData();
      }
    })
    that.isLoaded = true;
  }

  //加载聊天对象的历史信息(分页)
  async loadTalkerHistoryListData(){
    const that = this;

    if(that.msgList.length <= 0){
      return false;
    }

    let lastMsg = that.curTalker.lastMessage;
    let toDialogueID = that.curTalker.dialogueID || 0;

    await that.api.GHIMGetHistoryMessages({
      relationType: that.options.dialogType,
      relationId: 0,
      dialogueId: lastMsg ? lastMsg.dialogueID : 0,
      lastMessageId: that.msgList[0].imMessageID
    }).
    then(function (res) {
      if(res.isCompleted){
        let rData = res.data;

        that.msgCacheObj[toDialogueID] = rData.concat(that.msgCacheObj[toDialogueID]);
        that.msgList = that.msgCacheObj[toDialogueID];
      }
    });
  }

  //加载聊天对象的历史信息（全量）
  async loadTalkerAllHistoryListData(){
    const that = this;

    if(that.msgList.length <= 0){
      return false;
    }

    let lastMsg = that.curTalker.lastMessage;
    let toDialogueID = that.curTalker.dialogueID || 0;

    await that.api.GHIMGetAllHistoryMessages({
      relationType: that.options.dialogType,
      relationId: 0,
      dialogueId: lastMsg ? lastMsg.dialogueID : 0,
      lastMessageId: that.msgList[0].imMessageID
    }).
    then(function (res) {
      if(res.isCompleted){
        let rData = res.data;

        that.msgCacheObj[toDialogueID] = rData.concat(that.msgCacheObj[toDialogueID]);
        that.msgList = that.msgCacheObj[toDialogueID];
      }
    });
  }

  //设置消息已读
  async doSetMessageRead(){
    const that = this;

    //运营后台不为客服情况下，不调用设置接口
    if(that.mode == 'servicer' && !that.isCustomerServicerRole){
      return false;
    }

    let lastMsg = that.curTalker.lastMessage;

    if(!lastMsg || !lastMsg.dialogueID){
      return false;
    }

    await that.api.GHIMSetMessagesReaded({
      relationType: that.options.dialogType,
      relationId: 0,
      dialogueId: lastMsg.dialogueID
    }).
    then(function (res) {
      if(res.isCompleted){
        let rData = res.data;
      }
    });
  }

  //设置双方语种
  async setDialogLanguage({mylang, talkerlang}){
    const that = this;

    let lastMsg = that.curTalker.lastMessage;

    if(!lastMsg || !lastMsg.dialogueID){
      return false;
    }

    let params = {
      dialogueId: lastMsg.dialogueID,
      myLanguage: mylang,
      talkerLanguage: talkerlang
    }

    that.api.GHIMSetDialogueLanguage(params).then(function (res) {
      if(res.isCompleted){

      }
    })
  }

  // 调用翻译信息接口
  async doTranslateInfo(mItem){
    const that = this;

    if(!mItem || !mItem.imMessageID){
      return false;
    }

    let params = {
      messageId: mItem.imMessageID
    };

    let ouputText = '';

    await that.api.GHIMTranslateContent(params).then(function (res) {
      if(res.isCompleted){
        ouputText = res.data;
      }
    })
    mItem.contentTranslate = ouputText;
  }

  //设置日期格式
  dataFormat(NowDate,formatStr){
    var str = formatStr;
    var Week = ['日','一','二','三','四','五','六'];

    str=str.replace(/yyyy|YYYY/,NowDate.getFullYear());
    str=str.replace(/yy|YY/,(NowDate.getYear() % 100)>9?(NowDate.getYear() % 100).toString():'0' + (NowDate.getYear() % 100));

    str=str.replace(/MM/,NowDate.getMonth()>9?(NowDate.getMonth()+1).toString():'0' + (NowDate.getMonth()+1));
    str=str.replace(/M/g,(NowDate.getMonth()+Number(1)));

    str=str.replace(/w|W/g,Week[NowDate.getDay()]);

    str=str.replace(/dd|DD/,NowDate.getDate()>9?NowDate.getDate().toString():'0' + NowDate.getDate());
    str=str.replace(/d|D/g,NowDate.getDate());

    str=str.replace(/hh|HH/,NowDate.getHours()>9?NowDate.getHours().toString():'0' + NowDate.getHours());
    str=str.replace(/h|H/g,NowDate.getHours());
    str=str.replace(/mm/,NowDate.getMinutes()>9?NowDate.getMinutes().toString():'0' + NowDate.getMinutes());
    str=str.replace(/m/g,NowDate.getMinutes());

    str=str.replace(/ss|SS/,NowDate.getSeconds()>9?NowDate.getSeconds().toString():'0' + NowDate.getSeconds());
    str=str.replace(/s|S/g,NowDate.getSeconds());

    return str;
  }

  //获取客服账号信息
  async loadCustomerAccountInfo(){
    const that = this;
    let params = {
      corpId: $nuxt.$store.getters.loginInfo.corpID
    };

    return that.api.GHSysGetSupportStaff(params).then(function (res) {
      if(res.isCompleted){
        let rData = res.data;

        that.isCustomerServicerRole = Boolean(rData.userID == $nuxt.$store.getters.loginInfo.userID);
      }
    })
  }
}
