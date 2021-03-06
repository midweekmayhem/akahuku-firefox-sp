
/**
 * akahuku/protocol-channel.jsm
 */
/* global Components, FileReader,
 *   arAkahukuUtil, arAkahukuCompat,
 */

var EXPORTED_SYMBOLS = [
  "arAkahukuBypassChannel",
  "arAkahukuJPEGThumbnailChannel",
  "arAkahukuCacheChannel",
  "arAkahukuAsyncRedirectVerifyHelper",
  "arAkahukuDOMFileChannel",
];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cr = Components.results;
const Cu = Components.utils;

var loader
= Cc ["@mozilla.org/moz/jssubscript-loader;1"]
.getService (Ci.mozIJSSubScriptLoader);
try {
  if (typeof arAkahukuUtil === "undefined") {
    // necessary for arAkahukuCompat.CacheStorageService
    loader.loadSubScript
      ("chrome://akahuku/content/mod/arAkahukuUtil.js");
  }
  if (typeof arAkahukuCompat === "undefined") {
    loader.loadSubScript
      ("chrome://akahuku/content/mod/arAkahukuCompat.js");
  }
}
catch (e) {
  Components.utils.reportError (e);
}

var {AkahukuObserver}
= Cu.import ("resource://akahuku/observer.jsm", {});

/**
 * チャネルの nsIInterfaceRequestor.getInterface 用 base impl.
 *   (asyncOpen2 を実装する上では実装必須らしい)
 * see nsBaseChannel.cpp, nsNetUtil.h (NS_QueryNotificationCallbacks)
 */
function channel_getInterface (channel, iid) {
  // この関数内で instanceof や Cu.reportError は使えない
  try {
    if (channel.notificationCallbacks) {
      try {
        return channel.notificationCallbacks.getInterface (iid);
      }
      catch (e) {
      }
    }
    if (channel.loadGroup &&
        channel.loadGroup.notificationCallbacks) {
      return channel.loadGroup.notificationCallbacks.getInterface (iid);
    }
  }
  catch (e) {
  }
  throw Cr.NS_ERROR_NO_INTERFACE;
}

/**
 * チャネルの nsIChannel.asyncOpen2 用 base impl.
 */
function channel_asyncOpen2 (channel, listener) {
  var csm
    = Cc ["@mozilla.org/contentsecuritymanager;1"]
    .getService (Ci.nsIContentSecurityManager);
  var wrappedListener = csm.performSecurityCheck (channel, listener);
  channel.asyncOpen (wrappedListener, null);
}


var inMainProcess = true;
try {
  var appinfo
  = Cc ["@mozilla.org/xre/app-info;1"]
  .getService (Ci.nsIXULRuntime);
  inMainProcess = (appinfo.processType == appinfo.PROCESS_TYPE_DEFAULT);
}
catch (e) { Cu.reportError (e);
}

/**
 * リファラを送信しないチャネル
 * (画像などドキュメント以外ではクッキーも送受信しない)
 *   Inherits From: nsIChannel, nsIRequest
 *                  nsIStreamListener, nsIRequestObserver
 *                  nsIInterfaceRequestor, nsIChannelEventSink
 *
 * @param  String uri
 *         akahuku プロトコルの URI
 * @param  String originalURI 
 *         本来の URI
 * @param  String contentType
 *         MIME タイプ
 * @param  nsILoadInfo loadInfo
 */
function arAkahukuBypassChannel (uri, originalURI, contentType, loadInfo) {
  var callbacks = null;
  if (arguments.length == 1) {
    /* 既存のチャネルをラップして生成する */
    this._realChannel = arguments [0].QueryInterface (Ci.nsIChannel);
    callbacks = this._realChannel.notificationCallbacks;
    this.originalURI = this._realChannel.originalURI.clone ();
    this.URI = this._realChannel.URI.clone ();
    this.name = this.URI.spec;
    if (typeof this._realChannel.loadInfo !== "undefined") {
      this.loadInfo = this._realChannel.loadInfo;
    }
  }
  else {
    var ios
      = Cc ["@mozilla.org/network/io-service;1"]
      .getService (Ci.nsIIOService);
    this._realChannel
      = arAkahukuUtil.newChannel ({uri: originalURI, loadInfo: loadInfo});
    this.originalURI = ios.newURI (uri, null, null);
    // hide a real channel's originalURI
    // to bypass ScriptSecurityManager's CheckLoadURI
    this.URI = this.originalURI.clone ();
    this.name = uri;
    this.loadInfo = loadInfo || null;
  }
  /* 通知をフィルタリングする */
  this.notificationCallbacks = callbacks;
  this._realChannel.notificationCallbacks = this;

  if (contentType) {
    this.contentType = contentType;
  }
}
arAkahukuBypassChannel.prototype = {
  _listener : null,   /* nsIStreamListener  チャネルのリスナ */
  _realChannel : null,/* nsIChannel  実チャネル */
  _redirectCallback : null,
  _observingHeaders : false, /* Boolean ヘッダーを監視しているか */
  enableHeaderBlocker : true, /* Boolean  */

  /* 実チャネルに委譲しないプロパティ */
  name : "",
  notificationCallbacks : null,
  originalURI : null,
  URI : null,

  /**
   * インターフェースの要求
   *   nsISupports.QueryInterface
   *
   * @param  nsIIDRef iid
   *         インターフェース ID
   * @throws Cr.NS_ERROR_NO_INTERFACE
   * @return nsIProtocolHandler
   *         this
   */
  QueryInterface : function (iid) {
    if (iid.equals (Ci.nsISupports)
        || iid.equals (Ci.nsIChannel)
        || iid.equals (Ci.nsIRequest)
        || iid.equals (Ci.nsIInterfaceRequestor)
        || iid.equals (Ci.nsIChannelEventSink)
        || iid.equals (Ci.nsIStreamListener)
        || iid.equals (Ci.nsIRequestObserver)) {
      return this;
    }
    if ("nsIAsyncVerifyRedirectCallback" in Ci
        && iid.equals (Ci.nsIAsyncVerifyRedirectCallback)) {
      return this;
    }
        
    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  /**
   * インターフェース要求
   *   nsIInterfaceRequestor.getInterface 
   */
  getInterface : function (iid) {
    return channel_getInterface (this, iid);
  },
    
  /**
   * リクエストのキャンセル
   *   nsIRequest.cancel
   *
   * @param  Number status
   *         ステータス
   */
  cancel : function (status) {
    this._realChannel.cancel (status);
  },
    
  /**
   * リクエストの途中かどうか
   *   nsIRequest.isPending
   *
   * @return Boolean
   *         リクエストの途中かどうか
   */
  isPending : function () {
    return this._realChannel.isPending ();
  },
    
  /**
   * リクエストを再開する
   *   nsIRequest.resume
   */
  resume : function () {
    this._realChannel.resume ();
  },
    
  /**
   * リクエストを停止する
   *   nsIRequest.suspend
   */
  suspend : function () {
    this._realChannel.suspend ();
  },
    
  /**
   * 非同期オープン
   *   nsIChannel.asyncOpen
   *
   * @param  nsIStreamListener listener
   *         チャネルのリスナ
   * @param  nsISupports context
   *         ユーザ定義のコンテキスト
   */
  asyncOpen : function (listener, context) {
    this._listener = listener;
    if (this.enableHeaderBlocker
        && !(this.loadFlags & this._realChannel.LOAD_DOCUMENT_URI)) {
      /* 埋め込み要素の場合 */
      this.startHeadersBlocker ();
    }
    try {
      this._realChannel.asyncOpen (this, context);
    }
    catch (e) {
      this.stopHeadersBlocker ();
      throw e;
    }
  },

  asyncOpen2 : function (listener) {
    channel_asyncOpen2 (this, listener);
  },
    
  /**
   * 同期オープン
   *   nsIChannel.open
   *
   * @throws Cr.NS_ERROR_NOT_IMPLEMENTED
   */
  open : function () {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
    
  /**
   * リクエスト開始のイベント
   *   nsIRequestObserver.onStartRequest
   *
   * @param  nsIRequest request
   *         対象のリクエスト
   * @param  nsISupports context
   *         ユーザ定義
   */
  onStartRequest : function (request, context) {
    try {
      this._listener.onStartRequest (this, context);
    }
    catch (e) {
      this.cancel (e.result);
    }
  },
    
  /**
   * リクエスト終了のイベント
   *   nsIRequestObserver.onStopRequest
   *
   * @param  nsIRequest request
   *         対象のリクエスト
   * @param  nsISupports context
   *         ユーザ定義
   * @param  Number statusCode
   *         終了コード
   */
  onStopRequest : function (request, context, statusCode) {
    try {
      this._listener.onStopRequest (this, context, statusCode);
    }
    catch (e) {
    }
    finally {
      this._listener = null;
      this.stopHeadersBlocker ();
    }
  },
    
  /**
   * データ到着のイベント
   *   nsIStreamListener.onDataAvailable
   *
   * @param  nsIRequest request
   *         対象のリクエスト
   * @param  nsISupports context
   *         ユーザ定義
   * @param  nsIInputStream inputStream
   *         データを取得するストリーム
   * @param  PRUint32 offset
   *         データの位置
   * @param  PRUint32 count 
   *         データの長さ
   */
  onDataAvailable : function (request, context, inputStream, offset, count) {
    try {
      this._listener.onDataAvailable (this, context, inputStream,
                                      offset, count);
    }
    catch (e) {
      this.cancel (e.result);
    }
  },

  /**
   * 必要ならヘッダー監視を開始する
   */
  startHeadersBlocker : function () {
    if (this._observingHeaders
        || !(this._realChannel instanceof Ci.nsIHttpChannel)) {
      return;
    }
    try {
      this._blockReqListener = function () {}; // no reaction
      this._blockResListener = function () {};
      var filter = {
        urls: [this._realChannel.originalURI.spec],
      };
      AkahukuObserver.cookieBlocker
        .onRequestBlocked.addListener (this._blockReqListener, filter);
      AkahukuObserver.cookieBlocker
        .onResponseBlocked.addListener (this._blockResListener, filter);
      this._observingHeaders = true;
    }
    catch (e) {
      Cu.reportError (e);
    }
  },

  /**
   * ヘッダー監視を解除する
   */
  stopHeadersBlocker : function () {
    if (!this._observingHeaders) {
      return;
    }
    AkahukuObserver.cookieBlocker
      .onRequestBlocked.removeListener (this._blockReqListener);
    this._blockReqListener = null;
    AkahukuObserver.cookieBlocker
      .onResponseBlocked.removeListener (this._blockResListener);
    this._blockResListener = null;
    this._observingHeaders = false;
  },

  /**
   * ヘッダー監視を再設定する
   * (リダイレクト後など新しいチャネルに対して)
   */
  resetHeadersBlocker : function () {
    if (this._observingHeaders) {
      this.stopHeaderBlocker ();
      this.startHeaderBlocker ();
    }
  },

  /**
   * リダイレクトイベント
   *   nsIChannelEventSink.asyncOnChannelRedirect
   */
  asyncOnChannelRedirect : function (oldChannel, newChannel, flags, callback) {
    if (flags & Ci.nsIChannelEventSink.REDIRECT_INTERNAL) {
      // 内部リダイレクト(拡張機能など):
      // sink には報告せず newChannel への参照切替だけで済ます
      this._redirectChannel = newChannel;
      callback.onRedirectVerifyCallback (Cr.NS_OK);
      return;
    }

    // 新しい arAkahukuBypassChannel でラップしてリファラ制御等を続ける
    var redirectChannel
      = this.createRedirectedChannel (oldChannel, newChannel);
    if (redirectChannel == newChannel) {
      // ラップ出来なかったので内部の切替だけ(親リスナに伝えない)
      this._redirectChannel = newChannel;
      callback.onRedirectVerifyCallback (Cr.NS_OK);
      return;
    }

    // リダイレクト要求への返答は保留しながら、
    // 本チャネル自身のリスナ(親)に新チャネルへのリダイレクト要求を出し、
    // その結果を元のリダイレクト要求の結果として戻す
    this._redirectCallback = callback;
    this._redirectChannel = redirectChannel;
    var verifyHelper = new arAkahukuAsyncRedirectVerifyHelper ();
    verifyHelper.init (this, redirectChannel, flags, this);
  },
  /**
   * 非同期リダイレクトイベントの待ち受け
   *   nsIAsyncVerifyRedirectCallback.onRedirectVerifyCallback
   * @param nsresult result
   *        arAkahukuAsyncRedirectVerifyHelper の集計結果
   */
  onRedirectVerifyCallback : function (result) {
    var callback = this._redirectCallback;
    var redirectChannel = this._redirectChannel;
    this._redirectCallback = null;
    this._redirectChannel = null;
    if (Components.isSuccessCode (result) && redirectChannel) {
      // 新チャネルへのリダイレクトが受け入れられた
      redirectChannel.originalURI = this.originalURI;
      // _realChannl の切替 (ここが唯一)
      this._realChannel = redirectChannel;
      this.resetHeadersBlocker ();
    }

    // 元々のリダイレクト検証要求にも sink からの結果を返す
    if (callback) {
      callback.onRedirectVerifyCallback (result);
    }
  },

  /**
   * リダイレクトイベント (Obsolete since Gecko 2)
   *   nsIChannelEventSink.onChannelRedirect
   */
  onChannelRedirect : function (oldChannel, newChannel, flags) {
    try {
      var sink
        = this.notificationCallbacks
        .getInterface (Ci.nsIChannelEventSink);
    }
    catch (e) {
      return;
    }
    newChannel = this.createRedirectedChannel (oldChannel, newChannel);
    sink.onChannelRedirect (this, newChannel, flags);
  },

  /**
   * リダイレクト用 arAkahukuBypassChannel を生成する
   */
  createRedirectedChannel : function (oldChannel, newChannel) {
    if (!(newChannel instanceof Ci.nsIHttpChannel)) {
      return newChannel;
    }

    var newBypassChannel = new arAkahukuBypassChannel (newChannel);
    newBypassChannel.loadFlags
      |= (this.loadFlags | Ci.nsIChannel.LOAD_REPLACE);
    // newBypassChannel はストリームリスナの中継のみ行う
    newBypassChannel.enableHeaderBlocker = false;

    return newBypassChannel;
  },

  /**
   *  実チャネルに委譲するプロパティを定義する
   *
   * @param  String name 
   *         プロパティ名
   * @param  Boolean readonly
   *         読込専用か (setter も定義するか)
   */
  defineDelegateProperty : function (name, readonly) {
    var getter = function () { return this._realChannel [name]; };
    var setter = null;
    if (!readonly) {
      setter = function (newValue) { this._realChannel [name] = newValue; };
    }
    this._defineGetterAndSetter (name, getter, setter);
    return this;
  },
  _defineGetterAndSetter : function (name, getter, optSetter) {
    var descriptor = {
      configurable : false,
      enumerable : true,
      get : getter,
    };
    if (optSetter) {
      descriptor.set = optSetter;
    }
    try {
      if (typeof (Object.defineProperty) == "function") {
        /* Gecko2/Firefox4 (JavaScript 1.8.5) */
        Object.defineProperty (this, name, descriptor);
      }
      else {
        /* legacy fallback */
        this.__defineGetter__ (name, getter);
        if (optSetter) {
          this.__defineSetter__ (name, optSetter);
        }
      }
    }
    catch (e) {
      Components.utils.reportError (e);
    }
  },
};

arAkahukuBypassChannel.prototype
  /* nsIRequest のメンバ */
  .defineDelegateProperty ("loadFlags")
  .defineDelegateProperty ("loadGroup")
  //.defineDelegateProperty ("name", "readonly")
  .defineDelegateProperty ("status", "readonly")
  /* nsIChannel のメンバ */
  .defineDelegateProperty ("contentCharset")
  .defineDelegateProperty ("contentLength")
  .defineDelegateProperty ("contentType")
  //.defineDelegateProperty ("notificationCallbacks")
  //.defineDelegateProperty ("originalURI")
  .defineDelegateProperty ("owner")
  .defineDelegateProperty ("securityInfo", "readonly");

/**
 * JPEG サムネチャネル
 *   Inherits From: nsIChannel, nsIRequest, nsIInterfaceRequestor
 *                  nsITimerCallback
 *                  nsIWebProgressListener
 *
 * @param  String uri
 *         akahuku プロトコルの URI
 * @param  String originalURI 
 *         本来の URI
 * @param  String contentType
 *         MIME タイプ
 * @param  nsILoadInfo loadInfo
 */
function arAkahukuJPEGThumbnailChannel (uri, originalURI, contentType, loadInfo) {
  this._originalURI = originalURI;
  this.contentType = contentType;
  this.loadInfo = loadInfo || null;
    
  var ios
    = Cc ["@mozilla.org/network/io-service;1"]
    .getService (Ci.nsIIOService);
  this.URI = ios.newURI (uri, null, null);
  this.originalURI = this.URI.clone ();
}
arAkahukuJPEGThumbnailChannel.prototype = {
  _originalURI : "",  /* String  本来の URI */
  _listener : null,   /* nsIStreamListener  チャネルのリスナ */
  _context : null,    /* nsISupports  ユーザ定義のコンテキスト */
  _targetFile : null, /* nsIFile  保存対象のファイル */
  _isPending : false, /* Boolean  リクエストの途中かどうか */
    
  /* nsIRequest のメンバ */
  loadFlags : 0,
  loadGroup : null,
  name : "",
  status : Cr.NS_OK,
    
  /* nsIChannel のメンバ */
  contentCharset : "",
  contentLength : -1,
  contentType : "",
  notificationCallbacks : null,
  originalURI : null,
  owner : null,
  securityInfo : null,
  URI : null,
  loadInfo : null,
    
  /**
   * インターフェースの要求
   *   nsISupports.QueryInterface
   *
   * @param  nsIIDRef iid
   *         インターフェース ID
   * @throws Cr.NS_ERROR_NO_INTERFACE
   * @return nsIProtocolHandler
   *         this
   */
  QueryInterface : function (iid) {
    if (iid.equals (Ci.nsISupports)
        || iid.equals (Ci.nsIChannel)
        || iid.equals (Ci.nsIRequest)
        || iid.equals (Ci.nsIInterfaceRequestor)
        || iid.equals (Ci.nsIRequestObserver)) {
      return this;
    }
        
    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  getInterface : function (iid) {
    return channel_getInterface (this, iid);
  },
    
  /**
   * リクエストのキャンセル
   *   nsIRequest.cancel
   *
   * @param  Number status
   *         ステータス
   */
  cancel : function (status) {
    this.status = status;
  },
    
  /**
   * リクエストの途中かどうか
   *   nsIRequest.isPending
   *
   * @return Boolean
   *         リクエストの途中かどうか
   */
  isPending : function () {
    return this._isPending;
  },
    
  /**
   * リクエストを再開する
   *   nsIRequest.resume
   *
   * @throws Cr.NS_ERROR_NOT_IMPLEMENTED
   */
  resume : function () {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
    
  /**
   * リクエストを停止する
   *   nsIRequest.suspend
   *
   * @throws Cr.NS_ERROR_NOT_IMPLEMENTED
   */
  suspend : function () {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
    
  /**
   * 非同期オープン
   *   nsIChannel.asyncOpen
   *
   * @param  nsIStreamListener listener
   *         チャネルのリスナ
   * @param  nsISupports context
   *         ユーザ定義のコンテキスト
   */
  asyncOpen : function (listener, context) {
    this._listener = listener;
    this._context = context;
    var channel
      = arAkahukuUtil.newChannel ({
        uri: this._originalURI,
        loadInfo: this.loadInfo
      });
    channel.asyncOpen (this, null);
  },

  asyncOpen2 : function (listener) {
    channel_asyncOpen2 (this, listener);
  },
    
  /**
   * 同期オープン
   *   nsIChannel.open
   *
   * @throws Cr.NS_ERROR_NOT_IMPLEMENTED
   */
  open : function () {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
    
  // nsIRequestObserver
  onStartRequest : function (request, context) {
    var pipeSize = 0xffffffff;
    var pipe = Cc ["@mozilla.org/pipe;1"].createInstance (Ci.nsIPipe);
    pipe.init (true, true, 1<<12, pipeSize, null);
    this._pipe = pipe;
  },
    
  // nsIRequestObserver
  onDataAvailable : function (request, context, inputStream, offset, count) {
    var writeCount = this._pipe.outputStream.writeFrom (inputStream, count);
    if (writeCount == 0) {
      throw Cr.NS_BASE_STREAM_CLOSED;
    }
  },
    
  // nsIRequestObserver
  onStopRequest : function (request, context, statusCode) {
    this._pipe.outputStream.close ();
    this.status = statusCode;
    if (Components.isSuccessCode (statusCode)) {
      this._onSuccess ();
    }
    else {
      this._pipe.inputStream.close ();
      this._onFail ();
    }
  },

  /**
   * 元データのバッファ完了
   */
  _onSuccess : function () {
    var bindata = "";
    try {
      var bstream
        = Cc ["@mozilla.org/binaryinputstream;1"]
        .createInstance (Ci.nsIBinaryInputStream);
      bstream.setInputStream (this._pipe.inputStream);
      bindata = bstream.readBytes (this._pipe.inputStream.available ());
      bstream.close ();
      this._pipe.inputStream.close ();
    }
    catch (e) { Cu.reportError (e);
      bindata = "";
    }

    var start = bindata.indexOf ("\xff\xd8", 2);
    if (start == -1) {
      bindata = "";
    }
    else {
      var end = bindata.indexOf ("\xff\xd9", start);
      if (end == -1) {
        bindata = "";
      }
      else {
        bindata = bindata.substr (start, end + 2 - start);
      }
    }

    if (bindata.length == 0) {
      this.status = Cr.NS_ERROR_NO_CONTENT;
      this._onFail ();
      return;
    }
        
    var pipe = Cc ["@mozilla.org/pipe;1"].createInstance (Ci.nsIPipe);
        
    pipe.init (false, false, bindata.length, 1, null);
        
    pipe.outputStream.write (bindata, bindata.length);
    pipe.outputStream.close ();
        
    this._isPending = true;
    try {
      this._listener.onStartRequest (this, this._context);
      this._listener.onDataAvailable
        (this, this._context, pipe.inputStream, 0, bindata.length);
      this._isPending = false;
      this._listener.onStopRequest (this, this._context, Cr.NS_OK);
    }
    catch (e) {
      this._isPending = false;
    }
        
    this._listener = null;
    this._context = null;
  },
    
  /**
   * サムネイル取得失敗
   */
  _onFail : function () {
    this._isPending = true;
    try {
      this._listener.onStartRequest (this, this._context);
      this._isPending = false;
      this._listener.onStopRequest (this, this._context, this.status);
    }
    catch (e) {
      this._isPending = false;
    }
        
    this._listener = null;
    this._context = null;
  }
};

/**
 * キャッシュアクセスチャネル
 *   Inherits From: nsIChannel, nsIRequest, nsIInterfaceRequestor
 *                  nsICacheListener
 *
 * @param  String key
 * @param  nsIURI  uri
 * @param  nsILoadInfo loadInfo
 */
function arAkahukuCacheChannel (key, uri, loadInfo) {
  this._originalKey = new String (key);
  this._candidates = [
    this._originalKey,
    this._originalKey + ".backup", //スレのバックアップキャッシュ
  ];

  this._key = this._candidates.shift ();
  this.name = uri.spec;
  this.originalURI = uri;
  this.URI = uri;
  this.loadInfo = loadInfo || null;
}
arAkahukuCacheChannel.prototype = {
  _isPending : false,
  _wasOpened : false,
  _canceled : false,
  _redirectChannel : null, // asyncOpen するべきチャネル
  _started : false, // _listener に onStartRequest したか
  _stopped : false, // _listener に onStopRequest したか
  _contentEncoding : "",

  QueryInterface : function (iid) {
    if (iid.equals (Ci.nsISupports)
        || iid.equals (Ci.nsIRequest)
        || iid.equals (Ci.nsIInterfaceRequestor)
        || iid.equals (Ci.nsIChannel)
        || iid.equals (arAkahukuCompat.CacheStorageService.CallbackInterface)) {
      return this;
    }
    if ("nsIAsyncVerifyRedirectCallback" in Ci
        && iid.equals (Ci.nsIAsyncVerifyRedirectCallback)) {
      return this;
    }
        
    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  /* nsIRequest */
  loadFlags : Ci.nsIRequest.LOAD_NORMAL,
  loadGroup : null,
  name : "",
  status : Cr.NS_OK,
  cancel : function (status) {
    if (!this._canceled) {
      this._canceled = true;
      this.status = status;
    }
  },
  isPending : function () {
    return this._isPending;
  },
  resume : function () {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  suspend : function () {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /* nsIInterfaceRequestor */
  getInterface : function (iid) {
    return channel_getInterface (this, iid);
  },

  /* nsIChannel */
  contentCharset : "",
  contentLength : -1,
  contentType : "",
  notificationCallbacks : null, //ignored
  originalURI : null,
  owner : null,
  securityInfo : null,
  URI : null,
  loadInfo : null,
  asyncOpen : function (listener, context) {
    if (this._isPending) throw Cr.NS_ERROR_IN_PROGRESS;
    if (this._wasOpened) throw Cr.NS_ERROR_ALREADY_OPENED;
    if (this._canceled) throw this.status;
    this._isPending = true;
    this._wasOpened = true;
    this._listener = listener;
    this._context = context;
    if (this._canceled) {
      throw this.status;
    }
    try {
      if (inMainProcess) {
        this._asyncOpenCacheEntryToRead (this._key);
      }
      else {
        this._asyncOpenChannelFromCache (this._key);
      }
    }
    catch (e) { Components.utils.reportError (e);
      this._isPending = false;
      this._close (Cr.NS_BINDING_FAILED);
      throw e;
    }
    if (this.loadGroup) {
      try {
        this.loadGroup.addRequest (this, null);
      } catch (e) { Components.utils.reportError (e);
      }
    }
  },
  asyncOpen2 : function (listener) {
    channel_asyncOpen2 (this, listener);
  },
  open : function () {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // チャネルを片付ける
  _close : function (status)
  {
    if (this._isPending) {
      if (status == Cr.NS_BINDING_REDIRECTED) {
        this._started = true;
        this._stopped = true;
      }
      try {
        if (!this._started) {
          this._started = true;
          this._listener.onStartRequest (this, this._context);
        }
        this.status = status;
        this._isPending = false;
        if (!this._stopped) {
          this._stopped = true;
          this._listener.onStopRequest (this, this._context, status);
        }
      } catch (e) {
        Cu.reportError (e);
        this.status = status;
        this._isPending = false;
      }
      if (this.loadGroup) {
        try {
          this.loadGroup.removeRequest (this, null, this.status);
        } catch (e) {
        }
      }
    }
    else {
      this.status = status;
    }
    this._listener = null;
    this._context = null;
    this.notificationCallbacks = null;
  },

  _asyncOpenCacheEntryToRead : function (key)
  {
    var loadContextInfo = arAkahukuCompat.LoadContextInfo.default;
    if (this.loadInfo &&
        this.loadInfo.usePrivateBrowsing) {
      loadContextInfo = arAkahukuCompat.LoadContextInfo.private;
    }
    var ios
      = Cc ["@mozilla.org/network/io-service;1"]
      .getService (Ci.nsIIOService);
    var uri = ios.newURI (key, null, null);
    var flag = arAkahukuCompat.CacheStorage.OPEN_READONLY;
    arAkahukuCompat.CacheStorageService
      .diskCacheStorage (loadContextInfo, false)
      .asyncOpenURI (uri, "", flag, this);
  },

  /**
   * nsICacheEntryOpenCallback.onCacheEntryAvailable
   *
   * @param nsICacheEntry descriptor (or nsICacheDescriptor)
   * @param boolean isNew
   * @param nsIApplicationCache appCache
   * @param nsresult result
   */
  onCacheEntryAvailable: function (descriptor, isNew, appCache, status) {
    if (this._canceled) {
      try {
        if (descriptor) descriptor.close ();
      }
      finally {
        this._close (this.status);
      }
      return;
    }

    var isValidCache = false;
    if (Components.isSuccessCode (status)) {
      try { // レスポンスヘッダー解析
        var text = descriptor.getMetaDataElement ("response-head");
        var headers = (text ? text.split ("\n") : ["no response-head"]);
        var statusCode = this._parseHeaders (headers);
        if (!statusCode) {
          throw new Components.Exception
            ("Akahuku: unexpected cache status \""
             + headers [0] + "\" ("+ descriptor.key + ")",
             Cr.NS_ERROR_UNEXPECTED);
        }
        else if (statusCode [0] == "2" && descriptor.dataSize > 0) {
          isValidCache = true;
          this.contentLength = descriptor.dataSize;
        }
        else { // 404 など
          descriptor.close ();
        }
      }
      catch (e) { Components.utils.reportError (e);
        descriptor.close ();
      }
    }
    if (!isValidCache) { // 次の候補に切り替えて再調査
      var nextKey = this._candidates.shift ();
      if (nextKey) {
        this._key = nextKey;
        try {
          this._asyncOpenCacheEntryToRead (this._key);
        }
        catch (e) {
          if (e.result != Cr.NS_ERROR_CACHE_KEY_NOT_FOUND) {
            Components.utils.reportError (e);
          }
          // asyncOpenCacheEntryが失敗するような場合は諦める
          // TODO: or 時間をおいて再実行？
          this._close (Cr.NS_BINDING_FAILED);
        }
        return;
      }
    }

    try {
      if (isValidCache) {
        var ischannel
          = Components.classes
          ["@mozilla.org/network/input-stream-channel;1"]
          .createInstance (Ci.nsIInputStreamChannel);
        ischannel.setURI (this.URI);
        ischannel.contentStream = descriptor.openInputStream (0);          
        this._setupReplacementChannel (ischannel);
        this._openStreamChannelInternal (ischannel);
      }
      else {
        this._onNoValidCacheFound ();
      }
    }
    catch (e) { Components.utils.reportError (e);
      this._close (Cr.NS_BINDING_FAILED);
    }
  },
  /**
   * nsICacheEntryOpenCallback.onCacheEntryCheck
   */
  onCacheEntryCheck : function (entry, appCache) {
    try {
      entry.dataSize;
    }
    catch (e) {
      if (e.result == Cr.NS_ERROR_IN_PROGRESS) {
        return arAkahukuCompat.CacheEntryOpenCallback.RECHECK_AFTER_WRITE_FINISHED;
      }
      throw e;
    }
    return arAkahukuCompat.CacheEntryOpenCallback.ENTRY_WANTED;
  },
  mainThreadOnly : true,

  onRedirectVerifyCallback : function (result) {
    if (this._canceled) {
      this._close (this.status);
      return;
    }
    if (!Components.isSuccessCode (result)) {
      // 拒絶されても続行しようがない
      this._close (result);
      return;
    }

    try {
      if (this._redirectChannel) {
        // see nsBaseChannel.cpp nsBaseChannel::ContinueRedirect()
        this._redirectChannel.originalURI = this.originalURI;
        if (this.loadInfo && this.loadInfo.enforceSecurity) {
          this._redirectChannel.asyncOpen2 (this._listener);
        }
        else {
          this._redirectChannel.asyncOpen (this._listener, this._context);
        }
        this._redirectChannel = null;
      }
      else {
        Cu.reportError ("this must not be happen");
      }
    }
    catch (e) {
      Cu.reportError (e);
    }

    this._close (Cr.NS_BINDING_REDIRECTED);
  },

  _openStreamChannelInternal : function (channel) {
    channel.originalURI = this.originalURI;
    this.contentCharset = channel.contentCharset;
    this.contentType = channel.contentType;
    this.contentLength = channel.contentLength;
    try {
      // リクエスト仲介用 nsIStreamListener
      var that = this;
      var listener = {
        onStartRequest : function (request, con) {
          if (that._canceled) {
            try {
              request.cancel (that.status);
            }
            catch (e) {
            }
            return that._close (that.status);
          }
          try {
            that._started = true;
            that._listener.onStartRequest (that, that._context);
          }
          catch (e) {
            Cu.reportError (e);
            request.cancel (e.result);
            that._close (e.result);
          }
        },
        onStopRequest : function (request, con, statusCode) {
          if (that._canceled) return that._close (that.status);
          try {
            that._stopped = true;
            that._listener
              .onStopRequest (that, that._context, statusCode);
          }
          catch (e) {
            Cu.reportError (e);
          }
          that._close (statusCode);
        },
        onDataAvailable : function (req, con, ist, offset, c) {
          try {
            that._listener
              .onDataAvailable (that, that._context, ist, offset, c);
            if (that._canceled) {
              req.cancel (that.status);
              that._close (that.status);
            }
          }
          catch (e) {
            Cu.reportError (e);
            req.cancel (e.result);
            that._close (e.result);
          }
        },
      };
      if (this._contentEncoding) {
        var streamConverter
          = Cc ["@mozilla.org/streamconv;1?from="
          + this._contentEncoding + "&to=uncompressed"]
          .createInstance (Ci.nsIStreamConverter);
        // _listener <- (this <-) listener <- streamConverter <- channel
        streamConverter.asyncConvertData
          (this._contentEncoding, "uncompressed",
           listener, null);
        listener = streamConverter;
      }
      // _listener <- (this <-) listener <- channel
      channel.asyncOpen (listener, null);
    }
    catch (e) {
      Cu.reportError (e);
      this._close (Cr.NS_BINDING_FAILED);
    }
  },

  _parseHeaders : function (headers)
  {
    // forget previously parsed values
    this.contentCharset = "";
    this.contentType = "";
    this._contentEncoding = "";

    if (!/^HTTP\/(1\.[10]|2\.0) \d\d\d /.test (headers [0])) {
      return "";
    }
    var statusCode = headers [0].substr (9, 3);
    var newLocations = new Array ();
    for (var i = 1; i < headers.length; i++) {
      if (!headers [i].match (/^([^: ]+): +(.*)/)) {
        continue;
      }
      var key = RegExp.$1, value = RegExp.$2;
      switch (key) {
        case "Content-Type":
          var match = /^([^;]+)(?:; *charset=([^\s]+))?/.exec (value);
          this.contentType = match [1] || "";
          this.contentCharset = match [2] || "";
          break;
        case "Content-Encoding":
          if (!this._contentEncoding) {
            this._contentEncoding = value;
          }
          break;
        case "Location":
          if (statusCode [0] == "3") {
            newLocations.push (new String (value));
          }
          break;
      }
    }

    // Locationを候補に追加 (HTTP/1.x 3xx)
    for (var i = newLocations.length - 1; i >= 0; i--) {
      this._candidates.unshift (newLocations [i]);
    }

    return statusCode;
  },

  _setupReplacementChannel : function (channel) 
  {
    channel = channel.QueryInterface (Ci.nsIChannel);
    channel.loadGroup = this.loadGroup;
    channel.notificationCallbacks = this.notificationCallbacks;
    channel.loadFlags |= (this.loadFlags | Ci.nsIChannel.LOAD_REPLACE);

    try {
      channel = channel.QueryInterface (Ci.nsIInputStreamChannel);
    }
    catch (e) {
      if (e.result == Cr.NS_ERROR_NO_INTERFACE) {
        return;
      }
      throw e;
    }
    // 既知のコンテンツ情報を引き継ぐ
    if (this.contentType)
      channel.contentType = this.contentType;
    if (this.contentCharset)
      channel.contentCharset = this.contentCharset; 
  },

  /**
   * キャッシュを探索する(CacheStorageを使わない版(e10s-ready))
   */
  _asyncOpenChannelFromCache : function (key)
  {
    var channel
      = arAkahukuUtil.newChannel
      ({uri: key, loadInfo: this.loadInfo});
    const cacheFlagMask // 立たせる
      = Ci.nsIRequest.LOAD_FROM_CACHE
      | Ci.nsIRequest.VALIDATE_NEVER
      | Ci.nsICachingChannel.LOAD_ONLY_FROM_CACHE;
    const cacheFlagExcludeMask // 立っていたら降ろす
      = ~(Ci.nsIRequest.LOAD_BYPASS_CACHE
      | Ci.nsIRequest.VALIDATE_ALWAYS
      | Ci.nsIRequest.VALIDATE_ONCE_PER_SESSION
      | Ci.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE
      | Ci.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY);
    channel.loadFlags |= cacheFlagMask;
    channel.loadFlags &= cacheFlagExcludeMask;
    channel.QueryInterface (Ci.nsIHttpChannel);
    channel.requestMethod = "HEAD";
    var that = this;
    var listener = {
      onDataAvailable : function (request, context, inputStream, offset, count) {
        // drop data
        var sstream
          = Cc ["@mozilla.org/scriptableinputstream;1"]
          .createInstance (Ci.nsIScriptableInputStream);
        sstream.init (inputStream);
        sstream.read (count);
      },
      onStartRequest : function (request, context) {
        if (that._canceled) return that._close (that.status);
      },
      onStopRequest : function (request, context, statusCode) {
        if (that._canceled) return that._close (that.status);
        request.QueryInterface (Ci.nsIHttpChannel);
        if (Components.isSuccessCode (statusCode) &&
            request.responseStatus == 200) {
          // cache hit
          var channel
            = arAkahukuUtil.newChannel
            ({uri: that._key, loadInfo: that.loadInfo});
          that._setupReplacementChannel (channel);
          channel.loadFlags |= cacheFlagMask;
          channel.loadFlags &= cacheFlagExcludeMask;
          // akahuku://... のままで認識させるため LOAD_REPLACE は降ろす
          channel.loadFlags &= ~Ci.nsIChannel.LOAD_REPLACE;
          that._redirectChannel = channel;
          var verifyHelper = new arAkahukuAsyncRedirectVerifyHelper ();
          verifyHelper.init
            (that, channel, Ci.nsIChannelEventSink.REDIRECT_INTERNAL, that);
        }
        else {
          // no valid cache
          that._key = that._candidates.shift ();
          if (that._key) {
            that._asyncOpenChannelFromCache (that._key);
          }
          else {
            return that._onNoValidCacheFound ();
          }
        }
      },
    };
    channel.asyncOpen (listener, null);
  },

  /**
   * キャッシュが見つからなかった時の後処理
   */
  _onNoValidCacheFound : function () {
    // forget previously parsed values
    this.contentCharset = "";
    this.contentType = "";
    this.contentLength = 0;
    this._contentEncoding = "";

    if (this.loadFlags & Ci.nsIRequest.LOAD_BYPASS_CACHE ||
        (this.loadFlags & Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI) &&
        /\.(jpg|png|gif|webm|mp4)$/i.test (this._originalKey)) {
      // Shift-Reload かトップで画像等を開く場合は
      // キャッシュが無ければ普通に開く
      var channel
        = arAkahukuUtil.newChannel ({
          uri: this._originalKey,
          loadInfo: this.loadInfo
        });
      this._setupReplacementChannel (channel);
      if (channel instanceof Ci.nsIHttpChannel) {
        // リダイレクト
        var verifyHelper = new arAkahukuAsyncRedirectVerifyHelper ();
        verifyHelper.init
          (this, channel, Ci.nsIChannelEventSink.REDIRECT_INTERNAL, this);
        this._redirectChannel = channel; // asyncOpen が必要
        return;
      }
      else {
        // 内部でチャネルを開く (安全のため)
        this._openStreamChannelInternal (channel);
        return;
      }
    }
    else if (this.loadFlags & Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI) {
      // キャッシュが無いよメッセージ
      var ischannel = this._createFailChannel (this.URI);
      // 内部でチャネルを開く
      //   nsIInputStreamChannel をリダイレクトさせると
      //   ContentSecurityManager が(?)クラッシュを引き起こすため
      this._openStreamChannelInternal (ischannel);
      return;
    }

    // 通常失敗
    this._close (Cr.NS_ERROR_NO_CONTENT);
  },

  _createFailChannel : function (uri) 
  {
    var text = "No Cache for " + this._originalKey;
    var sstream
    = Cc ["@mozilla.org/io/string-input-stream;1"]
    .createInstance (Ci.nsIStringInputStream);
    sstream.setData (text, text.length);
        
    var inputStreamChannel
    = Cc ["@mozilla.org/network/input-stream-channel;1"]
    .createInstance (Ci.nsIInputStreamChannel);
        
    inputStreamChannel.setURI (uri);
    inputStreamChannel.contentStream = sstream;
    var channel = inputStreamChannel.QueryInterface (Ci.nsIChannel);
    channel.contentCharset = "utf-8";
    channel.contentType = "text/plain";
    channel.contentLength = text.length;
    return inputStreamChannel;
  },
};

// Gecko 2.0 以降にも対応したリダイレクト通知ヘルパー
// (based on nsAsyncRedirectVerifyHelper.cpp)
function arAkahukuAsyncRedirectVerifyHelper () 
{
}
arAkahukuAsyncRedirectVerifyHelper.prototype = {
  _callbackInitiated : false, /* Boolean */
  _expectedCallbacks : 0, /* Number VerifyCallback が返答されるはずの数 */
  _result : Cr.NS_OK, /* nsresult リダイレクト可否 */

  _oldChan : null,
  _newChan : null,
  _flags : 0,
  _callback : null,

  init : function (oldChan, newChan, flags, callback)
  {
    if (Ci.nsIAsyncVerifyRedirectCallback) {// Gecko2.0+
      callback = callback.QueryInterface (Ci.nsIAsyncVerifyRedirectCallback);
    }
    if (typeof (callback.onRedirectVerifyCallback) != "function") {
      throw new Components.Exception
        ("arAkahukuAsyncRedirectVerifyHelper: "
         + "no onRedirectVerifyCallback for a callback",
         Cr.NS_ERROR_UNEXPECTED);
    }
    this._callback = callback;
    this._oldChan = oldChan;
    this._newChan = newChan;
    this._flags   = flags;
    var tm
      = Cc ["@mozilla.org/thread-manager;1"]
      .getService (Ci.nsIThreadManager);
    this._callbackThread = tm.currentThread;

    tm.mainThread.dispatch (this, Ci.nsIThread.DISPATCH_NORMAL);
  },
  //nsIRunnable
  run : function ()
  {
    if (!Components.isSuccessCode (this._oldChan.status)) {
      this._returnCallback (Cr.NS_BINDING_ABORTED);
      return;
    }

    var gsink;
    if ("@mozilla.org/contentsecuritymanager;1" in Components.classes) {
      // Global channel event sink is deprecated since [Bug 1226909].
      // Imitage nsIOService::AsyncOnChannelRedirect in netwerk/base/nsIOService.cpp
      try {
        gsink = Components.classes
          ["@mozilla.org/contentsecuritymanager;1"]
          .getService (Ci.nsIChannelEventSink);
      }
      catch (e) {
        if (e.result == Cr.NS_ERROR_XPC_GS_RETURNED_FAILURE) {
          // no nsIChannelEventSink (Gecko < 46)
        }
        else {
          Components.utils.reportError (e);
        }
      }
    }
    if (!gsink && "@mozilla.org/netwerk/global-channel-event-sink;1" in Components.classes) {
      try {
        gsink = Components.classes
          ["@mozilla.org/netwerk/global-channel-event-sink;1"]
          .getService (Ci.nsIChannelEventSink);
      }
      catch (e) { Components.utils.reportError (e);
      }
    }

    try {
      if (gsink)
        this._delegateOnChannelRedirect (gsink);
    } catch (e) { Components.utils.reportError (e);
      this._returnCallback (e.result);
      return;
    }
    try {
      if (this._oldChan.notificationCallbacks) {
        this._delegateOnChannelRedirect
          (this._oldChan.notificationCallbacks);
      }
    } catch (e) { Components.utils.reportError (e);
    }
    try {
      if (this._oldChan.loadGroup
          && this._oldChan.loadGroup.notificationCallbacks) {
        this._delegateOnChannelRedirect
          (this._oldChan.loadGroup.notificationCallbacks);
      }
    } catch (e) { Components.utils.reportError (e);
    }
    this._initCallback ();
  },
  _initCallback : function ()
  {
    this._callbackInitiated = true;
    if (this._expectedCallbacks == 0)
      this._returnCallback (this._result);
  },
  _returnCallback : function (result)
  {
    try {
      this._callbackInitiated = false;
      var event = new arAkahukuAsyncRedirectVerifyHelper.Event (this._callback, result);
      this._callbackThread.dispatch (event, Ci.nsIThread.DISPATCH_NORMAL);
    } catch (e) { Components.utils.reportError (e);
      //no echo
    }
  },

  _delegateOnChannelRedirect : function (sink)
  {
    this._expectedCallbacks ++;

    if (!Components.isSuccessCode (this._oldChan.status)) {
      // 既にキャンセルされてるのでリダイレクトも中止
      this.onRedirectVerifyCallback (Cr.NS_BINDING_ABORTED);
      throw new Components.Exception
        ("Old channel has been canceled:",
         Cr.NS_BINDING_ABORTED);
    }

    var cesink;
    if (sink instanceof Ci.nsIChannelEventSink) {
      cesink = sink;
    } else {
      try {
        cesink = sink.getInterface (Ci.nsIChannelEventSink);
      } catch (e) { Components.utils.reportError (e);
        this._expectedCallbacks --;
        return;
      }
    }
    try {
      if (typeof (cesink.onChannelRedirect) == "function") {
        // Obsolete since Gecko 2.0 
        cesink.onChannelRedirect
          (this._oldChan, this._newChan, this._flags);
        this._expectedCallbacks --; // Callbackを待つ必要がない
      } else {
        // Requires Gecko 2.0 (Firefox 4)
        cesink.asyncOnChannelRedirect
          (this._oldChan, this._newChan, this._flags, this);
      }
    } catch (e) { Components.utils.reportError (e);
      // リダイレクト通知を中止
      this.onRedirectVerifyCallback (e.result);
      throw e;
    }
  },

  // リダイレクトの問い合わせ結果を受ける
  // nsIAsyncVerifyRedirectCallback
  onRedirectVerifyCallback : function (result)
  {
    this._expectedCallbacks --;
    if (!Components.isSuccessCode (result)) {
      if (Components.isSuccessCode (this._result))
        this._result = result; // 最初の否定的結果を保存
      if (this._callbackInitiated)
        this._returnCallback (this._result);
    }
    if (this._callbackInitiated
        && this._expectedCallbacks == 0) {
      this._returnCallback (this._result);
    }
  },
  QueryInterface : function (iid) {
    if (iid.equals (Ci.nsIAsyncVerifyRedirectCallback)
        || iid.equals (Ci.nsIRunnable)
        || iid.equals (Ci.nsISupports)) {
      return this;
    }
    throw Cr.NS_ERROR_NO_INTERFACE;
  },
};
arAkahukuAsyncRedirectVerifyHelper.Event = function (callback, result) {
  this._callback = callback;
  this._result = result;
};
arAkahukuAsyncRedirectVerifyHelper.Event.prototype = {
  // nsIRunnable
  run : function ()
  {
    this._callback.onRedirectVerifyCallback (this._result);
  },
  QueryInterface : function (iid) {
    if (iid.equals (Ci.nsIRunnable)
        || iid.equals (Ci.nsISupports)) {
      return this;
    }
    throw Cr.NS_ERROR_NO_INTERFACE;
  },
};


/**
 * ファイル読み込みチャンネル
 *
 * [e10s] File と FileReader はコンテントプロセスでも使える
 * (ただし File.createFrom* はコンテントプロセスでは基本使えないため
 *  親プロセスに生成してもらってメッセージ経由で得る必要がある)
 */
function arAkahukuDOMFileChannel (uri, path, loadInfo) {
  this._domFilePending = true;
  const {AkahukuFileUtil} = Cu.import ("resource://akahuku/fileutil.jsm", {});
  var promise = AkahukuFileUtil.createFromFileName (path);
  this._expectPromiseToFile (promise);
  this._path = path;
  this._reader = null;
  this._listener = null;
  this._context = null;
  this._isPending = false;
  this._isOpened = false;
  this._isStarted = false;

  this.name = uri.spec;
  this.URI = uri.clone ();
  this.originalURI = this.URI.clone ();
  this.loadInfo = loadInfo || null;
}
arAkahukuDOMFileChannel.prototype = {
  QueryInterface : function (iid) {
    if (iid.equals (Ci.nsISupports)
        || iid.equals (Ci.nsIRequest)
        || iid.equals (Ci.nsIInterfaceRequestor)
        || iid.equals (Ci.nsIChannel)) {
      return this;
    }
    throw Cr.NS_ERROR_NO_INTERFACE;
  },
  // nsIRequest
  loadFlags : 0,
  loadGroup : null,
  name : "",
  status : Cr.NS_OK,
  // nsIInterfaceRequestor
  getInterface : function (iid) {
    return channel_getInterface (this, iid);
  },
  // nsIChannel
  contentCharset : "",
  contentLength : -1,
  contentType : "",
  notificationCallbacks : null,
  originalURI : null,
  owner : null,
  securityInfo : null,
  URI : null,
  loadInfo : null,

  cancel : function (status) {
    if (this._reader && this._reader.readyState == this._reader.LOADING) {
      this._reader.abort ();
    }
    this.status = status;
    this._isPending = false;
    this._listener = null;
    this._context = null;
    this._reader = null;
  },
  isPending : function () {return this._isPending},
  resume : function () { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  suspend : function () {throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  open : function () { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  asyncOpen : function (listener, context) {
    if (this._isPending) {
      throw Components.Exception
        ("arAkahukuDOMFileChannel is in progress",
         Cr.NS_ERROR_IN_PROGRESS, Components.stack.caller);
    }
    if (this._isOpened) {
      throw Components.Exception
        ("arAkahukuDOMFileChannel is already opened",
         Cr.NS_ERROR_ALREADY_OPENED, Components.stack.caller);
    }
    if (!this._domFilePending && !this._domFile) {
      throw Components.Exception
        ("arAkahukuDOMFileChannel is not initialized properly",
         Cr.NS_ERROR_DOM_INVALID_STATE_ERR, Components.stack.caller);
    }
    this._listener = listener;
    this._context = context;

    var reader = null;
    if (typeof FileReader !== "undefined") {
      try {
        reader = new FileReader ();
      }
      catch (e) {
        // ESR24-38 causes NS_ERROR_FAILURE while page loading
        Cu.reportError (e);
      }
    }
    if (!reader) {
      reader
        =  Cc ["@mozilla.org/files/filereader;1"]
        .createInstance (Ci.nsIDOMFileReader);
    }
    reader.onloadstart = (function (channel) {
      return function (event) {
        channel._onReaderLoadStart (event.target);
      };
    })(this);
    reader.onload = (function (channel) {
      return function (event) {
        channel._onReaderLoaded (event);
      };
    })(this);
    reader.onerror = (function (channel) {
      return function (event) {
        channel._onReaderError (event);
      };
    })(this);
    this._reader = reader;
    if (!this._domFilePending) {
      this._startReadDOMFile ();
    }
    this._isPending = true;
    this._isOpened = true;
    if (this.loadGroup) {
      this.loadGroup.addRequest (this, null);
    }
  },
  asyncOpen2 : function (listener) {
    channel_asyncOpen2 (this, listener);
  },
  _startReadDOMFile : function () {
    if ("@mozilla.org/io/arraybuffer-input-stream;1" in Cc) {
      this._reader.readAsArrayBuffer (this._domFile);
    }
    else {
      // old way for no existence of nsIArrayBufferInputStream
      this._reader.readAsBinaryString (this._domFile);
    }
  },
  _onReaderLoadStart : function (reader) {
    if (!this._isStarted) {
      this._listener.onStartRequest (this, this._context);
    }
    this._isStarted = true;
  },
  _onReaderLoaded : function (event) {
    var reader = event.target;
    var dataLength = -1;
    var istream;
    if ("@mozilla.org/io/arraybuffer-input-stream;1" in Cc) {
      // requires Firefox 23.0+
      dataLength = reader.result.byteLength;
      istream
        = Cc ["@mozilla.org/io/arraybuffer-input-stream;1"]
        .createInstance (Ci.nsIArrayBufferInputStream);
      istream.setData (reader.result, 0, reader.result.byteLength);
    }
    else {
      dataLength = reader.result.length;
      istream
        = Cc ["@mozilla.org/io/string-input-stream;1"]
        .createInstance (Ci.nsIStringInputStream);
      istream.setData (reader.result, reader.result.length);
    }
    this.contentLength = dataLength;

    try {
      this._listener.onDataAvailable
        (this, this._context, istream, 0, istream.available ());
      this._isPending = false;
      this._listener.onStopRequest (this, this._context, Cr.NS_OK);
      istream.close ();
    }
    catch (e) { Cu.reportError (e);
      this._isPending = false;
    }

    this._listener = null;
    this._context = null;
    if (this.loadGroup) {
      this.loadGroup.removeRequest (this, null, this.status);
    }
  },
  _onReaderError : function (event) {
    if (event.target.error.name) { // DOMError (Gecko 13.0)
      Cu.reportError ("arAkahukuDOMFileChannel: FileReader.onerror => "
          + event.target.error.name);
    }
    else if (event.target.error.code) { // FileError
      Cu.reportError ("arAkahukuDOMFileChannel: FileReader.onerror => "
          + "error.code = " + event.target.error.code);
    }
    this._onError (Cr.NS_BINDING_FAILED);
  },
  _onError : function (status) {
    this.status = status;
    try {
      if (this._isPending) {
        if (!this._isStarted) {
          this._listener.onStartRequest (this, this._context);
        }
        this._listener.onStopRequest (this, this._context, this.status);
        this._isPending = false;
      }
    }
    catch (e) { Cu.reportError (e);
      this._isPending = false;
    }
    this._listener = null;
    this._context = null;
    if (this.loadGroup) {
      this.loadGroup.removeRequest (this, null, this.status);
    }
  },
  _expectPromiseToFile : function (promise) {
    this._domFilePending = true;
    var that = this;
    promise.then (function (file) {
      that._domFilePending = false;
      if (!file) {
        Cu.reportError ("arAkahukuDOMFileChannel: promise resulted in " + file);
        that._onError (Cr.NS_ERROR_UNEXPECTED);
        return;
      }
      that._domFile = file;
      if (that._isPending) { // asyncOpen has been called
        that._startReadDOMFile ();
      }
    }, function (reason) {
      if (reason.result == Cr.NS_ERROR_FILE_NOT_FOUND) {
        Cu.reportError ("arAkahukuDOMFileChannel: not found; "
          + that._path);
      }
      else {
        Cu.reportError ("arAkahukuDOMFileChannel: promise is rejected for "
          + reason + "; " + that._path);
      }
      that._domFilePending = false;
      that._onError (reason.result || Cr.NS_ERROR_UNEXPECTED);
    });
  },
};

