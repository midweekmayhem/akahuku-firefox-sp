/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

/**
 * Require: arAkahukuConfig, arAkahukuDOM, arAkahukuHistory,
 *          arAkahukuServerName
 */

/**
 * サイドバーのスレ情報
 */
function arAkahukuSidebarThread () {
}
arAkahukuSidebarThread.prototype = {
  num : 0,           /* Number  スレ番号 */
  comment : "",      /* String  コメント */
    
  reply : 0,         /* Number  レス数 */
  lastReply : 0,     /* Number  更新前のレス数 */
  expire : "",       /* String  消滅時刻 */
  warning : "",      /* String  もうすぐ消えます */
  lastNum : 0,       /* Number  最終レス番号*/
    
  imageSrc : "",     /* String  画像の URI */
  imageSrcType : 0,  /* Number  画像の種類
                      * 1: サムネ
                      * 2: カタログ */
  imageLink : "",    /* String  元画像の URI */
  imageNum : 0,      /* Number  画像の番号 */
  imageWidth : 0,    /* Number  画像の幅 */
  imageHeight : 0,   /* Number  画像の高さ */
  imageBytes : 0,    /* Number  画像のバイト数 */
  imageExt : "",     /* String  画像の拡張子 */
    
  threadLink : "",   /* String  スレの URI */
  isVisited : false, /* Boolean  既読フラグ */
  isMarked : false,  /* Boolean  マーク */
  isExpired : false, /* Boolean  消滅フラグ */
  node : null        /* HTMLDivElement  サイドバー上の div 要素 */
};
/**
 * サイドバーの板情報
 */
function arAkahukuSidebarBoard () {
  this.threads = new Array ();
}
arAkahukuSidebarBoard.prototype = {
  threads : null,           /* Array  スレ情報の配列
                             *   [arAkahukuSidebarThread, ...] */
  lastSelected : null,      /* HTMLDivElement  最後にカーソルが
                             *   載っていた div 要素 */
  lastSelectedImage : null, /* HTMLDivElement  最後にカーソルが
                             *   載っていた img 要素 */
    
  /**
   * スレを追加する
   *
   * @param  arAkahukuSidebarThread thread
   *         追加するスレ
   */
  addThread : function (thread) {
    this.threads.push (thread);
  },
    
  /**
   * スレを取得する
   *
   * @param  Number num
   *         取得するスレの番号
   * @return arAkahukuSidebarThread
   *         スレ情報
   *         存在しなかった場合には null
   */
  getThread : function (num) {
    for (var i = 0; i < this.threads.length; i ++) {
      if (this.threads [i].num == num) {
        return this.threads [i];
      }
    }
    return null;
  }
};
/**
 * サイドバー管理
 *   [サイドバー]
 */
var arAkahukuSidebar = {
  currentSidebarDocument : null, /* XULDocument  現在対象のサイドバーの
                                  *   ドキュメント */
    
  boards : null, /* Object  板情報の配列
                  *   <String 板名, arAkahukuSidebarBoard> */
    
  enable : false,             /* Boolean  サイドバーを使用する */
  enableBackground : false,   /* Boolean  非表示の間も反映させる */
  enableCheckCatalog : false, /* Boolean  カタログをチェックする */
  enableTabVertical : false,  /* Boolean  タブを縦に表示する */
  enableTabHidden : false,    /* Boolean  タブを表示しない */
  enableTabMenu : false,    /* Boolean  タブメニューを表示する */
  enableSortVisited : false,  /* Boolean  既読のスレを上に持ってくる */
  enableSortMarked : false,   /* Boolean  マークしたスレを上に持ってくる */
  maxView : 30,               /* Number  表示する数 */
  maxCache : 100,             /* Number  内部で保持する数 */
  thumbnailSize : 64,         /* Number  サムネのサイズ [px] */
  sortType : 0,               /* Number  ソートの方法
                               *   0: スレの立った順
                               *   1: 最終レス番号順 */
  sortInvert : false,         /* Boolean  ソートを反転 */
  enableSave : false,         /* Boolean  サイドバーの内容を保存する */
  list : new Array (),        /* Array  表示する板
                               *   [String 板名, ...] */
    
  enableMarked : false,       /* Boolean  マークしたスレのタブを作る */
    
  shortcutKeycode : 0,              /* Number  ショートカットキーのキーコード */
  shortcutModifiersAlt : false,     /* Boolean  ショートカットキーの Alt */
  shortcutModifiersCtrl : false,    /* Boolean  ショートカットキーの Ctrl */
  shortcutModifiersMeta : false,    /* Boolean  ショートカットキーの Meta */
  shortcutModifiersShift : false,   /* Boolean  ショートカットキーの Shift */
    
  /**
   * 初期化処理
   */
  init : function () {
    window.addEventListener
    ("keydown",
     function () {
      arAkahukuSidebar.onKeyDown (arguments [0]);
    }, true);
        
    arAkahukuSidebar.boards = new Object ();
        
    var board = new arAkahukuSidebarBoard ();
    arAkahukuSidebar.boards ["*_*"] = board;
        
    arAkahukuSidebar.getConfig ();
    if (arAkahukuSidebar.enableSave) {
      var filename
        = arAkahukuFile.systemDirectory
        + arAkahukuFile.separator + "sidebar.txt";
            
      var text = arAkahukuFile.readFile (filename);
      var currentBoard = "";
            
      text.replace
        (/([^\n\r]+)[\r\n]+/g,
         function (matched, line) {
          if (line.indexOf (",") == -1) {
            currentBoard = line;
            board = new arAkahukuSidebarBoard ();
            arAkahukuSidebar.boards [currentBoard] = board;
          }
          else {
            var values = line.split (/,/);
            var i = 0;
                        
            var thread = new arAkahukuSidebarThread ();
                        
            thread.num = parseInt (unescape (values [i]));
            i ++;
            thread.comment = unescape (values [i]);
            i ++;
            thread.reply = parseInt (unescape (values [i]));
            i ++;
            thread.lastReply = parseInt (unescape (values [i]));
            i ++;
            thread.expire = unescape (values [i]);
            i ++;
            thread.warning = unescape (values [i]);
            i ++;
            thread.lastNum = parseInt (unescape (values [i]));
            i ++;
            thread.imageSrc = unescape (values [i]);
            i ++;
            thread.imageSrcType = parseInt (unescape (values [i]));
            i ++;
            thread.imageLink = unescape (values [i]);
            i ++;
            thread.imageNum = parseInt (unescape (values [i]));
            i ++;
            thread.imageWidth = parseInt (unescape (values [i]));
            i ++;
            thread.imageHeight = parseInt (unescape (values [i]));
            i ++;
            thread.imageBytes = parseInt (unescape (values [i]));
            i ++;
            thread.imageExt = unescape (values [i]);
            i ++;
            thread.threadLink = unescape (values [i]);
            i ++;
            thread.isVisited = unescape (values [i]) == "true";
            i ++;
            thread.isMarked = unescape (values [i]) == "true";
            i ++;
            thread.isExpired = unescape (values [i]) == "true";
            i ++;
            arAkahukuSidebar.boards [currentBoard].addThread
              (thread);
          }
        });
      if (arAkahukuSidebar.enableMarked) {
        arAkahukuSidebar.updateMarked ();
      }
    }
  },
    
  /**
   * キーが押されたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onKeyDown : function (event) {
    if (Akahuku.enableAll
        && arAkahukuSidebar.enable
        && arAkahukuSidebar.enableShortcut) {
      if (arAkahukuSidebar.shortcutKeycode == event.keyCode
          && arAkahukuSidebar.shortcutModifiersAlt == event.altKey
          && arAkahukuSidebar.shortcutModifiersCtrl == event.ctrlKey
          && arAkahukuSidebar.shortcutModifiersMeta == event.metaKey
          && arAkahukuSidebar.shortcutModifiersShift == event.shiftKey) {
        toggleSidebar ("viewAkahukuSidebar");
      }
    }
  },
    
  /**
   * 終了処理
   */
  term : function () {
    if (arAkahukuSidebar.enableSave) {
      var filename
      = arAkahukuFile.systemDirectory
      + arAkahukuFile.separator + "sidebar.txt";
      var text = "";
      var name, board, thread;
            
      for (name in arAkahukuSidebar.boards) {
        board = arAkahukuSidebar.boards [name];
                
        text += name + "\n";
        for (var i = 0; i < board.threads.length; i ++) {
          thread = board.threads [i];
                    
          text +=
            escape (thread.num)
            + "," + escape (thread.comment)
            + "," + escape (thread.reply)
            + "," + escape (thread.lastReply)
            + "," + escape (thread.expire)
            + "," + escape (thread.warning)
            + "," + escape (thread.lastNum)
            + "," + escape (thread.imageSrc)
            + "," + escape (thread.imageSrcType)
            + "," + escape (thread.imageLink)
            + "," + escape (thread.imageNum)
            + "," + escape (thread.imageWidth)
            + "," + escape (thread.imageHeight)
            + "," + escape (thread.imageBytes)
            + "," + escape (thread.imageExt)
            + "," + escape (thread.threadLink)
            + "," + escape (thread.isVisited)
            + "," + escape (thread.isMarked)
            + "," + escape (thread.isExpired)
            + "\n";
        }
      }
            
      arAkahukuFile.createFile (filename, text);
    }
  },
    
  /**
   * 設定を読み込む
   */
  getConfig : function () {
    arAkahukuSidebar.enable
    = arAkahukuConfig
    .initPref ("bool", "akahuku.sidebar", false);
    var broadcaster = document.getElementById ("mainBroadcasterSet");
    if (broadcaster == null) {
      /* Mozilla Suite では無効にする */
      arAkahukuSidebar.enable = false;
    }
    if (arAkahukuSidebar.enable) {
      arAkahukuSidebar.enableBackground
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.background", false);
      arAkahukuSidebar.enableCheckCatalog
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.check.catalog", true);
      arAkahukuSidebar.enableTabVertical
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.tab.vertical", false);
      arAkahukuSidebar.enableTabHidden
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.tab.hidden", false);
      arAkahukuSidebar.enableTabMenu
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.tab.menu", false);
      arAkahukuSidebar.enableSortVisited
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.sort.visited", false);
      arAkahukuSidebar.enableSortMarked
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.sort.marked", true);
      arAkahukuSidebar.sortType
      = arAkahukuConfig
      .initPref ("int",  "akahuku.sidebar.sort.type", 1);
      arAkahukuSidebar.sortInvert
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.sort.invert", false);
      arAkahukuSidebar.enableMarked
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.markedtab", true);
      arAkahukuSidebar.maxView
      = arAkahukuConfig
      .initPref ("int",  "akahuku.sidebar.max.view", 50);
      arAkahukuSidebar.maxCache
      = arAkahukuConfig
      .initPref ("int",  "akahuku.sidebar.max.cache", 100);
      arAkahukuSidebar.thumbnailSize
      = arAkahukuConfig
      .initPref ("int",  "akahuku.sidebar.thumbnail.size", 64);
      arAkahukuSidebar.enableSave
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.save", false);
      var value
      = arAkahukuConfig
      .initPref ("char", "akahuku.sidebar.list", "");
      arAkahukuSidebar.list = new Array ();
            
      if (value) {
        /* 値を解析するだけなので代入はしない */
        value.replace
          (/([^,]+),?/g,
           function (matched, part1) {
            arAkahukuSidebar.list.push (unescape (part1));
            return "";
          });
      }
            
      arAkahukuSidebar.enableShortcut
      = arAkahukuConfig
      .initPref ("bool", "akahuku.sidebar.shortcut", false);
      if (arAkahukuSidebar.enableShortcut) {
        var value
          = arAkahukuConfig
          .initPref ("char", "akahuku.sidebar.shortcut.keycode",
                     "VK_S");
        value
          = unescape (value);
        arAkahukuSidebar.shortcutKeycode
          = Components.interfaces.nsIDOMKeyEvent ["DOM_" + value];
                
        arAkahukuSidebar.shortcutModifiersAlt
          = arAkahukuConfig
          .initPref ("bool",
                     "akahuku.sidebar.shortcut.modifiers.alt",
                     false);
        arAkahukuSidebar.shortcutModifiersCtrl
          = arAkahukuConfig
          .initPref ("bool",
                     "akahuku.sidebar.shortcut.modifiers.ctrl",
                     false);
        arAkahukuSidebar.shortcutModifiersMeta
          = arAkahukuConfig
          .initPref ("bool",
                     "akahuku.sidebar.shortcut.modifiers.meta",
                     true);
        arAkahukuSidebar.shortcutModifiersShift
          = arAkahukuConfig
          .initPref ("bool",
                     "akahuku.sidebar.shortcut.modifiers.shift",
                     true);
      }
    }
  },
    
  /**
   * サイドバーを取得する
   *
   * @return XULElement
   *         サイドバー
   */
  getSidebar : function () {
    var sidebar = null;
        
    var mediator
    = Components.classes ["@mozilla.org/appshell/window-mediator;1"]
    .getService (Components.interfaces.nsIWindowMediator);
    var sidebarWindow = mediator.getMostRecentWindow ("mozilla:sidebar");
        
    if (sidebarWindow) {
      /* 拡張でサイドバーが切り離されている場合 */
      sidebar = sidebarWindow.document.getElementById ("sidebar");
    }
        
    if (!sidebar) {
      sidebar = document.getElementById ("sidebar");
    }
        
    return sidebar;
  },
    
  /**
   * 通常モードをロードしたイベント
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  String name
   *         対象の板
   */
  onNormalLoad : function (targetDocument, name) {
    var thread = null;
    var node, nodeName;
    var lastReply = null;
    var num, comment;
    var reply, expire, warning;
    var imageSrc, imageLink, imageNum;
    var imageWidth, imageHeight, imageBytes, imageExt;
    var threadLink;
        
    var board = null;
        
    if (name in arAkahukuSidebar.boards) {
      board = arAkahukuSidebar.boards [name];
    }
    else {
      board = new arAkahukuSidebarBoard ();
      arAkahukuSidebar.boards [name] = board;
    }
        
    var nodes = Akahuku.getMessageBQ (targetDocument);
    for (var i = 0; i < nodes.length; i ++) {
      var container = Akahuku.getMessageContainer (nodes [i]);
      
      if (!container) {
        /* スレ */
                
        if (lastReply && thread) {
          node = lastReply;
          lastReply = null;
          while (node) {
            nodeName = node.nodeName.toLowerCase ();
                        
            if (nodeName == "#text") {
              if (node.nodeValue.indexOf ("No.") != -1
                  && node.nodeValue.match (/No\.([0-9]+)/)) {
                /* レス番号の場合 */
                thread.lastNum = parseInt (RegExp.$1);
                break;
              }
            }
                        
            node = node.previousSibling;
          }
        }
                
        node = nodes [i];
                
        num = 0;
        comment = node.innerHTML;
                
        reply = 0;
        expire = "";
        warning = "";
                
        imageSrc = "";
        imageLink = "";
        imageNum = 0;
        imageWidth = 0;
        imageHeight = 0;
        imageBytes = 0;
        imageExt = "";
                
        threadLink = "";
                
        while (node) {
          nodeName = node.nodeName.toLowerCase ();
          if (nodeName == "hr") {
            break;
          }
                    
          if (nodeName == "#text") {
            if (num == 0
                && node.nodeValue.indexOf ("No.") != -1
                && node.nodeValue.match (/No\.([0-9]+)/)) {
              /* スレ番号の場合 */
              num = parseInt (RegExp.$1);
            }
          }
          else if (nodeName == "a") {
            var href;
            href = node.getAttribute ("href");
                        
            if (href) {
              if (href.match (/^res\/([0-9]+)\.html?$/)
                  || href.match (/^2\/([0-9]+)\.html?$/)
                  || href.match (/^b\/([0-9]+)\.html?$/)
                  || href.match (/\?res=([0-9]+)$/)) {
                /* スレへのリンク */
                threadLink = node.href;
              }
              else if (href.match (/red\/([0-9]+)/)
                       || href.match (/d\/([0-9]+)/)
                       || href.match (/src\/([0-9]+)/)
                       || href.match (/r\.php\?r=([0-9]+)/)) {
                /* 画像のリンクの場合 */
                imageLink = node.href;
                imageNum = parseInt (RegExp.$1);
                                
                if (node.firstChild) {
                  if (node.firstChild.nodeName.toLowerCase ()
                      == "img") {
                    /* 画像の場合 */
                                        
                    imageSrc = node.firstChild.src;
                                        
                    imageWidth = node.firstChild.width;
                    imageHeight = node.firstChild.height;
                    if ("alt" in node.firstChild
                        && node.firstChild.alt
                        .match (/([0-9]*)/)) {
                      imageBytes = RegExp.$1;
                    }
                    else {
                      imageBytes = "0";
                    }
                  }
                  else if (node.firstChild.nodeValue
                           && node.firstChild.nodeValue
                           .match (/[0-9]+\.(.+)$/)) {
                    /* 画像のファイル名の場合 */
                    imageExt = RegExp.$1;
                  }
                }
              }
            }
          }
          else if (nodeName == "small") {
            if (node.innerHTML.match
                (/(([0-9]+\u5E74)?([0-9]+\u6708)?([0-9]+\u65E5)?[0-9]+:[0-9]+)\u9803\u6D88\u3048\u307E\u3059/)) {
              expire = RegExp.$1;
            }
          }
                    
          node = node.previousSibling;
        }
                
        node = nodes [i];

        while (node) {
          nodeName = node.nodeName.toLowerCase ();
          
          if (nodeName == "hr"
              || nodeName == "table"
              || (nodeName == "div"
                  && "className" in node
                  && arAkahukuDOM.hasClassName (node, "s"))) {
            break;
          }
                    
          if (nodeName == "font") {
            if (node.innerHTML.match
                (/\u30EC\u30B9([0-9]+)\u4EF6\u7701\u7565/)) {
              reply = parseInt (RegExp.$1);
            }
            else if (node.innerHTML.match
                     (/<b>\u3053\u306E\u30B9\u30EC\u306F[^<]+<\/b>/i)) {
              warning = node.innerHTML;
            }
          }
                    
          node = node.nextSibling;
        }
                
        var append = false;
        thread = board.getThread (num);
        if (thread == null) {
          append = true;
          thread = new arAkahukuSidebarThread ();
        }
                
        thread.num = num;
        thread.comment = comment;
                
        if (append) {
          thread.lastReply = -1;
        }
        else {
          thread.lastReply = thread.reply;
        }
        thread.reply = reply;
        thread.expire = expire;
        thread.warning = warning;
        thread.lastNum = num;
                
        if (name.match (/cgi_(b|9|10)/)
            && imageSrc) {
          imageSrc = imageSrc.replace (/img\.2chan\.net/,
                                       "cgi.2chan.net");
        }
                
        thread.imageSrc = imageSrc;
        thread.imageSrcType = 1;
        thread.imageLink = imageLink;
        thread.imageNum = imageNum;
        thread.imageWidth = imageWidth;
        thread.imageHeight = imageHeight;
        thread.imageBytes = imageBytes;
        thread.imageExt = imageExt;
                
        if (threadLink == "") {
          threadLink = targetDocument.location.href;
        }
        thread.threadLink = threadLink;
                
        if (append) {
          board.addThread (thread);
        }
      }
      else {
        /* レス */
        if (thread) {
          thread.reply ++;
                    
          lastReply = nodes [i];
        }
      }
    }
        
    if (lastReply && thread) {
      node = lastReply;
      lastReply = null;
      while (node) {
        nodeName = node.nodeName.toLowerCase ();
                
        if (nodeName == "#text") {
          if (node.nodeValue.indexOf ("No.") != -1
              && node.nodeValue.match (/No\.([0-9]+)/)) {
            /* レス番号の場合 */
            thread.lastNum = parseInt (RegExp.$1);
            break;
          }
        }
                
        node = node.previousSibling;
      }
    }
  },
    
  /**
   * レス送信モードをロードしたイベント
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  String name
   *         対象の板
   */
  onReplyLoad : function (targetDocument, name) {
    arAkahukuSidebar.onNormalLoad (targetDocument, name);
  },
    
  /**
   * カタログをロードしたイベント
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  String name
   *         対象の板
   */
  onCatalogLoad : function (targetDocument, name) {
    var thread = null;
    var node, nodeName, node2, nodeName2;
    var threadLink;
        
    var num;
    var reply;
    var imageSrc, imageNum;
        
    var board = null;
        
    if (name in arAkahukuSidebar.boards) {
      board = arAkahukuSidebar.boards [name];
    }
    else {
      board = new arAkahukuSidebarBoard ();
      arAkahukuSidebar.boards [name] = board;
    }
    
    var nodes = targetDocument.getElementsByTagName ("td");
    for (var i = 0; i < nodes.length; i ++) {
      node = nodes [i].firstChild;
            
      num = 0;
            
      reply = 0;
      imageNum = 0;
      imageSrc = "";
            
      threadLink = "";
            
      while (node) {
        nodeName = node.nodeName.toLowerCase ();
                
        if (nodeName == "a") {
          var href;
          href = node.getAttribute ("href");
          if (href
              && (href.match (/res\/([0-9]+)/)
                  || href.match (/2\/([0-9]+)/)
                  || href.match (/b\/([0-9]+)/))) {
            num = parseInt (RegExp.$1);
            threadLink = node.href;
                        
            node2 = node.firstChild;
                        
            while (node2) {
              nodeName2 = node2.nodeName.toLowerCase ();
                            
              if (nodeName2 == "img") {
                if (node2.getAttribute ("src")
                    .match (/cat\/([0-9]+)/)) {
                  imageNum = parseInt (RegExp.$1);
                  imageSrc = node2.src;
                }
              }
              if (nodeName2 == "font") {
                if (node2.innerHTML.match (/^([0-9]+)$/)) {
                  reply = parseInt (RegExp.$1);
                }
              }
                            
              node2 = node2.nextSibling;
            }
          }
        }
        else if (nodeName == "font") {
          if (node.innerHTML.match (/^([0-9]+)$/)) {
            reply = parseInt (RegExp.$1);
          }
        }
                
        node = node.nextSibling;
      }
            
      var append = false;
      thread = board.getThread (num);
      if (thread == null) {
        append = true;
        thread = new arAkahukuSidebarThread ();
      }
            
      thread.num = num;
            
      if (append) {
        thread.lastReply = -1;
      }
      else {
        thread.lastReply = thread.reply;
      }
      thread.reply = reply;
      if (thread.lastNum <= 0) {
        thread.lastNum = -(100 + i);
      }
            
      if (thread.imageSrcType != 1) {
        thread.imageSrc = imageSrc;
        thread.imageSrcType = 2;
      }
      thread.imageNum = imageNum;
            
      thread.threadLink = threadLink;
            
      if (append) {
        board.addThread (thread);
      }
    }
  },
    
  /**
   * スレが消滅したイベント
   *
   * @param  String name
   *         対象の板
   * @param  Number num
   *         スレの番号
   */
  onThreadExpired : function (name, num) {
    var thread = null;
    var board = null;
        
    var exists = false;
    for (var i = 0; i < arAkahukuSidebar.list.length; i ++) {
      if (name == arAkahukuSidebar.list [i].replace (/:/, "_")) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      return;
    }
        
    if (name in arAkahukuSidebar.boards) {
      board = arAkahukuSidebar.boards [name];
    }
    else {
      board = new arAkahukuSidebarBoard ();
      arAkahukuSidebar.boards [name] = board;
    }
        
    thread = board.getThread (num);
    if (thread == null) {
      return;
    }
        
    thread.isExpired = true;
        
    arAkahukuSidebar.sort (name);
    arAkahukuSidebar.update (name);
    if (arAkahukuSidebar.enableMarked) {
      arAkahukuSidebar.sort ("*_*");
      arAkahukuSidebar.update ("*_*");
    }
  },
    
  /**
   * スレを更新したイベント
   *
   * @param  String name
   *         対象の板
   * @param  Number num
   *         スレの番号
   * @param  Number reply
   *         レス数
   *         null ならば変更ナシ
   * @param  String expire
   *         消滅時刻
   *         null ならば変更ナシ
   * @param  String warning
   *         消滅情報
   *         null ならば変更ナシ
   * @param  Number lastNum
   *         最終レス番号
   *         null ならば変更ナシ
   */
  onThreadChange : function (name, num, reply, expire, warning, lastNum) {
    var thread = null;
    var board = null;
        
    var exists = false;
    for (var i = 0; i < arAkahukuSidebar.list.length; i ++) {
      if (name == arAkahukuSidebar.list [i].replace (/:/, "_")) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      return;
    }
        
    if (name in arAkahukuSidebar.boards) {
      board = arAkahukuSidebar.boards [name];
    }
    else {
      board = new arAkahukuSidebarBoard ();
      arAkahukuSidebar.boards [name] = board;
    }
        
    thread = board.getThread (num);
    if (thread == null) {
      return;
    }
        
    thread.lastReply = thread.reply;
    if (reply != null) {
      thread.reply = reply;
    }
    if (expire != null) {
      thread.expire = expire;
    }
    if (warning != null) {
      thread.warning = warning;
    }
    if (lastNum != null) {
      thread.lastNum = lastNum;
    }
        
    arAkahukuSidebar.updateVisited (name);
    arAkahukuSidebar.sort (name);
    arAkahukuSidebar.update (name);
    if (arAkahukuSidebar.enableMarked) {
      arAkahukuSidebar.sort ("*_*");
      arAkahukuSidebar.update ("*_*");
    }
  },
    
  /**
   * 既読フラグを更新する
   *
   * @param  String name
   *         対象の板
   */
  updateVisited : function (name) {
    var board, thread;
        
    if (name in arAkahukuSidebar.boards) {
      board = arAkahukuSidebar.boards [name];
    }
    else {
      board = new arAkahukuSidebarBoard ();
      arAkahukuSidebar.boards [name] = board;
    }
        
    for (var i = 0; i < board.threads.length; i ++) {
      thread = board.threads [i];
            
      var uri
      = Components.classes ["@mozilla.org/network/standard-url;1"]
      .createInstance (Components.interfaces.nsIURI);
      uri.spec = thread.threadLink;
            
      thread.isVisited = arAkahukuHistory.isVisited (uri);
    }
  },
    
  /**
   * ソートする
   *
   * @param  String name
   *         対象の板
   */
  sort : function (name) {
    var board;
        
    if (name in arAkahukuSidebar.boards) {
      board = arAkahukuSidebar.boards [name];
    }
    else {
      board = new arAkahukuSidebarBoard ();
      arAkahukuSidebar.boards [name] = board;
    }
        
    var max = 0;
    for (var i = 0; i < board.threads.length; i ++) {
      if (board.threads [i].num > max) {
        max = board.threads [i].num;
      }
    }
    for (var i = 0; i < board.threads.length; i ++) {
      if (board.threads [i].num < max - 10000) {
        /* 最新のスレから 10000 経ったものは強制削除  */
        board.threads [i].isExpired = true;
      }
    }
        
    board.threads.sort (function (x, y) {
        var result = 0;
        /* 消えたスレは後にする */
        if (x.isExpired && !y.isExpired) {
          result += 100;
        }
        else if (!x.isExpired && y.isExpired) {
          result += -100;
        }
        if (arAkahukuSidebar.enableSortVisited) {
          /* 既読のスレを先頭に持ってくるか */
          if (x.isVisited && !y.isVisited) {
            result += -1;
          }
          else if (!x.isVisited && y.isVisited) {
            result += 1;
          }
        }
        if (arAkahukuSidebar.enableSortMarked) {
          /* マークしたスレを先頭に持ってくるか */
          if (x.isMarked && !y.isMarked) {
            result += -10;
          }
          else if (!x.isMarked && y.isMarked) {
            result += 10;
          }
        }
        if (result) {
          return result;
        }
        ; /* switch のインデント用 */
        switch (arAkahukuSidebar.sortType) {
          case 0:
            return (y.num - x.num);
            break;
          case 1:
            return (y.lastNum - x.lastNum);
            break;
        }
        return 0;
      });
        
    if (board.threads.length > arAkahukuSidebar.maxCache) {
      board.threads.splice (arAkahukuSidebar.maxCache);
    }
        
    if (arAkahukuSidebar.sortInvert) {
      board.threads = board.threads.reverse ();
    }
  },
    
  /**
   * 
   */
  updateMarked : function () {
    var markedBoard = arAkahukuSidebar.boards ["*_*"];
        
    markedBoard.threads = new Array ();
    for (var name in arAkahukuSidebar.boards) {
      var board = arAkahukuSidebar.boards [name];
      for (var i = 0; i < board.threads.length; i ++) {
        var thread = board.threads [i];
        if (thread.isMarked) {
          markedBoard.threads.push (thread);
        }
      }
    }
  },
    
  /**
   * サイドバーを更新する
   *
   * @param  String name
   *         対象の板
   */
  update : function (name) {
    if (Components.interfaces.nsIPrefBranch2 == undefined) {
      /* 監視していない場合にのみ設定を取得する */
      arAkahukuConfig.loadPrefBranch ();
      arAkahukuSidebar.getConfig ();
    }
        
    var menuitem = document.getElementById ("viewAkahukuSidebar");
    if (menuitem.getAttribute ("checked") != "true") {
      return;
    }
    var sidebar = arAkahukuSidebar.getSidebar ();
    if (!sidebar.docShell) {
      return;
    }
    var sidebarDocument;
    try {
      sidebarDocument = sidebar.contentDocument;
    }
    catch (e) {
      sidebarDocument = arAkahukuSidebar.currentSidebarDocument;
    }
    var iframe
    = sidebarDocument.getElementById ("akahuku_sidebar_iframe_" + name);
    if (iframe == null) {
      return;
    }
    var div;
    var node, node2, nodes;
    var targetDocument = iframe.contentDocument;
    var board, thread;
    var server, dir, hide, aima;
        
    if (name.match (/^([^_]+)_(.+)$/)) {
      server = RegExp.$1;
      dir = RegExp.$2;
    }
        
    if (iframe.getAttribute ("__modified") != "true") {
      /* 最初の更新でクリックをフックする */
      iframe.setAttribute ("__modified", "true");
      iframe.contentWindow.addEventListener
      ("mousemove",
       function () {
        arAkahukuSidebar.onMouseMove (arguments [0]);
      }, false);
      iframe.contentWindow.addEventListener
      ("mousedown",
       function () {
        arAkahukuSidebar.onClick (arguments [0]);
      }, false);
    }
        
    if (name in arAkahukuSidebar.boards) {
      board = arAkahukuSidebar.boards [name];
    }
    else {
      board = new arAkahukuSidebarBoard ();
      arAkahukuSidebar.boards [name] = board;
    }
        
    if (targetDocument.body == null) {
      return;
    }
        
    arAkahukuDOM.setText (targetDocument.body, null);
        
    var hidden = 0;
    var i, j;
    for (i = 0;
         i < board.threads.length
           && i - hidden < arAkahukuSidebar.maxView;
         i ++) {
      thread = board.threads [i];
            
      aima = false;
      try {
        if (typeof Aima_Aimani != "undefined") {
          if (Aima_Aimani.hideNGNumberSidebarHandler) {
            hide
              = Aima_Aimani.hideNGNumberSidebarHandler
              (server, dir,
               thread.num,
               thread.comment,
               thread.imageNum,
               thread.imageWidth, thread.imageHeight,
               thread.imageBytes, thread.imageExt);
            if (hide == 1) {
              hidden ++;
              continue;
            }
            else if (hide == 2) {
              aima = true;
            }
          }
        }
      }
      catch (e) { Akahuku.debug.exception (e);
      }
            
      var size = arAkahukuSidebar.thumbnailSize + 2;
      var ok = true;
            
      try {
        if (thread.node == null) {
          ok = false;
        }
        else {
          div = thread.node;
                    
          div.style.height = size + "px";
          if (thread.isVisited) {
            div.style.borderColor = "#eeaa88";
          }
          else {
            div.style.borderColor = "#aaccff";
          }
                    
          nodes = div.getElementsByTagName ("img");
          if (nodes && nodes.length >= 1) {
            node = nodes [0];
            node.style.visibility = "";
            node.style.maxWidth = (size - 2) + "px";
            node.style.maxHeight = (size - 2) + "px";
            var src = thread.imageSrc;
            src = arAkahukuP2P.tryEnP2P (src);
            if (node.src != src
                || !node.complete) {
              node.src = src;
            }
                        
            if (thread.imageLink) {
              node.setAttribute ("__link", thread.imageLink);
            }
          }
                    
          nodes = div.getElementsByTagName ("div");
          if (nodes && nodes.length >= 1) {
            for (j = 0; j < nodes.length; j ++) {
              node = nodes [j];
              if ("className" in node) {
                if (node.className
                    == "akahuku_sidebar_comment") {
                  /* thread.comment に HTML が含まれるので
                   * innerHTML を使用する  */
                  node.innerHTML = thread.comment;
                  node.style.visibility = "";
                  if (thread.imageNum) {
                    node.style.marginLeft = size + "px";
                  }
                  node.style.height = (size - 14) + "px";
                }
                else if (node.className
                         == "akahuku_sidebar_status") {
                  if (thread.imageNum) {
                    node.style.marginLeft = size + "px";
                  }
                  if (thread.isVisited) {
                    node.style.backgroundColor = "#eeaa88";
                  }
                  else {
                    node.style.backgroundColor = "#aaccff";
                  }
                }
              }
            }
          }
                    
          nodes = div.getElementsByTagName ("span");
          if (nodes && nodes.length >= 1) {
            for (j = 0; j < nodes.length; j ++) {
              node = nodes [j];
              if ("className" in node) {
                if (node.className == "akahuku_sidebar_reply") {
                  var text = "";
                  text += thread.reply + " \u30EC\u30B9";
                  if (thread.lastReply != -1) {
                    var diff
                      = thread.reply - thread.lastReply;
                    if (diff > 0) {
                      text += "(+" + diff + ")";
                    }
                    else if (diff < 0) {
                      text += "(" + diff + ")";
                    }
                  }
                  arAkahukuDOM.setText (node, text);
                }
                else if (node.className
                         == "akahuku_sidebar_expire2") {
                  if (thread.expire) {
                    arAkahukuDOM.setText (node, " \uFF0F ");
                  }
                }
                else if (node.className
                         == "akahuku_sidebar_expire") {
                  arAkahukuDOM.setText (node, thread.expire);
                }
                else if (node.className
                         == "akahuku_sidebar_aima") {
                  if (aima) {
                    arAkahukuDOM.setText (node, " [\u6D88]");
                    node.style.display = "";
                  }
                  else {
                    node.style.display = "none";
                  }
                }
                else if (node.className
                         == "akahuku_sidebar_mark") {
                  if (thread.isMarked) {
                    node.style.display = "";
                  }
                  else {
                    node.style.display = "none";
                  }
                }
              }
            }
          }
        }
      }
      catch (e) { Akahuku.debug.exception (e);
        ok = false;
      }
            
      if (!ok) {
        div = targetDocument.createElement ("div");
        div.className = "akahuku_sidebar_thread";
        div.style.borderWidth = "0px 0px 2px 0px";
        div.style.borderStyle = "solid";
        if (thread.isVisited) {
          div.style.borderColor = "#eeaa88";
        }
        else {
          div.style.borderColor = "#aaccff";
        }
        div.style.marginBottom = "2px";
        div.style.padding = "0px";
        div.style.clear = "left";
        div.style.height = size + "px";
        div.style.overflow = "-moz-hidden-unscrollable";
        div.style.color = "#800000";
        div.style.backgroundColor = "transparent";
        div.setAttribute ("__link", thread.threadLink);
        div.setAttribute ("__num", thread.num);
                
        if (thread.imageNum) {
          node = targetDocument.createElement ("img");
          node.className = "akahuku_sidebar_image";
          node.style.maxWidth = (size - 2) + "px";
          node.style.maxHeight = (size - 2) + "px";
          node.style.borderWidth = "1px";
          node.style.borderStyle = "solid";
          node.style.borderColor = "transparent";
          node.style.cssFloat = "left";
          var src = thread.imageSrc;
          src = arAkahukuP2P.tryEnP2P (src);
          node.src = src;
          if (thread.imageLink) {
            node.setAttribute ("__link", thread.imageLink);
          }
          div.appendChild (node);
        }
                
        node = targetDocument.createElement ("span");
        node.className = "akahuku_sidebar_mark";
        node.style.fontSize = "12px";
        node.style.cssFloat = "right";
        node.style.color = "#ff0000";
        node.style.backgroundColor = "#eeaa88";
        node.appendChild (targetDocument.createTextNode ("orz"));
        if (!thread.isMarked) {
          node.style.display = "none";
        }
        div.appendChild (node);
                
        node = targetDocument.createElement ("div");
        node.className = "akahuku_sidebar_comment";
        node.style.fontSize = "11px";
        if (thread.imageNum) {
          node.style.marginLeft = size + "px";
        }
        else {
          node.style.marginLeft = 8 + "px";
        }
        node.style.height = (size - 14) + "px";
        node.style.overflow = "-moz-hidden-unscrollable";
        /* thread.comment に HTML が含まれるので innerHTML を使用する  */
        node.innerHTML = thread.comment;
        div.appendChild (node);
                
        node = targetDocument.createElement ("div");
        node.className = "akahuku_sidebar_status";
        node.style.fontSize = "11px";
        if (thread.imageNum) {
          node.style.marginLeft = size + "px";
        }
        else {
          node.style.marginLeft = 8 + "px";
        }
        node.style.height = 14 + "px";
        node.style.textAlign = "right";
        node.style.overflow = "-moz-hidden-unscrollable";
        node.style.color = "#800000";
        if (thread.isVisited) {
          node.style.backgroundColor = "#eeaa88";
        }
        else {
          node.style.backgroundColor = "#aaccff";
        }
        node2 = targetDocument.createElement ("span");
        node2.className = "akahuku_sidebar_reply";
        var text = "";
        text += thread.reply + " \u30EC\u30B9";
        if (thread.lastReply != -1) {
          var diff = thread.reply - thread.lastReply;
          if (diff > 0) {
            text += "(+" + diff + ")";
          }
          else if (diff < 0) {
            text += "(" + diff + ")";
          }
        }
        node2.appendChild (targetDocument.createTextNode (text));
        node.appendChild (node2);
        node2 = targetDocument.createElement ("span");
        node2.className = "akahuku_sidebar_expire2";
        if (thread.expire) {
          node2.appendChild (targetDocument.createTextNode
                             (" \uFF0F "));
        }
        node.appendChild (node2);
        node2 = targetDocument.createElement ("span");
        node2.className = "akahuku_sidebar_expire";
        if (thread.warning) {
          node2.style.fontWeight = "bold";
          node2.style.color = "#ff0000";
          node2.style.backgroundColor = "transparent";
        }
        node2.appendChild (targetDocument.createTextNode
                           (thread.expire));
        node.appendChild (node2);
        node2 = targetDocument.createElement ("span");
        node2.className = "akahuku_sidebar_aima";
        node2.setAttribute ("name",
                            "hide_" + server + "_" + dir
                            + "_" + thread.num + "_" + thread.imageNum);
        node2.style.color = "#627f29";
        node2.appendChild (targetDocument.createTextNode (" [\u6D88]"));
        if (!aima) {
          node2.style.display = "none";
        }
        node.appendChild (node2);
        div.appendChild (node);
                
        thread.node = div;
      }
            
      if (name == "*_*") {
        targetDocument.body.appendChild (div.cloneNode (true));
      }
      else {
        targetDocument.body.appendChild (div);
      }
    }
  },
    
  /**
   * マウスが動いたイベント
   *   スレの上にあれば色を変える
   *
   * @param  Event event
   *         対象のイベント
   */
  onMouseMove : function (event) {
    var sidebar = arAkahukuSidebar.getSidebar ();
    if (!sidebar.docShell) {
      return;
    }
    var sidebarDocument;
    try {
      sidebarDocument = sidebar.contentDocument;
    }
    catch (e) {
      sidebarDocument = arAkahukuSidebar.currentSidebarDocument;
    }
    var deck = sidebarDocument.getElementById ("akahuku_sidebar_deck");
    var box = deck.selectedPanel;
        
    if (box.id.match (/^akahuku_sidebar_deck_(.+)$/)) {
      var name = RegExp.$1;
      var board;
            
      if (name in arAkahukuSidebar.boards) {
        board = arAkahukuSidebar.boards [name];
      }
      else {
        board = new arAkahukuSidebarBoard ();
        arAkahukuSidebar.boards [name] = board;
      }
            
      var node = event.explicitOriginalTarget;
      var image = null;
      while (node) {
        if ("className" in node) {
          if (node.className == "akahuku_sidebar_thread") {
            if (node != board.lastSelected) {
              if (board.lastSelected) {
                board.lastSelected.style.backgroundColor
                  = "transparent";
              }
              board.lastSelected = node;
              node.style.backgroundColor = "#d4e5f6";
            }
            break;
          }
          else if (node.className == "akahuku_sidebar_image"
                   && node.getAttribute ("__link")) {
            if (node != board.lastSelectedImage) {
              if (board.lastSelectedImage) {
                board.lastSelectedImage.style.borderColor
                  = "transparent";
              }
              board.lastSelectedImage = node;
              node.style.borderColor = "#0000ff";
            }
            image = node;
          }
        }
        node = node.parentNode;
      }
            
      if (image == null) {
        if (board.lastSelectedImage) {
          board.lastSelectedImage.style.borderColor = "transparent";
          board.lastSelectedImage = null;
        }
      }
    }
  },
    
  /**
   * スレをクリックしたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onClick : function (event) {
    if (event.button != 0 && event.button != 1) {
      return;
    }
        
    var node = event.target;
    var nodes, div;
    var link = "";
    var i;
        
    while (node) {
      if ("getAttribute" in node) {
        link = node.getAttribute ("__link");
                
        if (link) {
          var tab = null;
          var tabbrowser = document.getElementById ("content");
          function reloadTarget (browser, targetDocument) {
            try {
              if (arAkahukuReload.enable
                  && arAkahukuReload.enableHook
                  && Akahuku.getDocumentParam (targetDocument)) {
                arAkahukuReload.diffReloadCore
                  (targetDocument,
                   arAkahukuReload.enableHookSync, false);
              }
              else {
                browser.contentWindow
                  .QueryInterface (Components.interfaces
                                   .nsIInterfaceRequestor)
                  .getInterface (Components.interfaces
                                 .nsIWebNavigation)
                  .reload (Components.interfaces.nsIWebNavigation
                           .LOAD_FLAGS_NONE);
              }
            }
            catch (e) { Akahuku.debug.exception (e);
            }
          }
          if ("tabs" in tabbrowser) {
            /* Firefox4/Gecko2.0 */
            for (i =0; i < tabbrowser.tabs.length; i++) {
              tab = tabbrowser.tabs [i];
              var browser = tabbrowser.getBrowserForTab (tab);
              var targetDocument = browser.contentDocument;
              if (targetDocument.location.href == link) {
                reloadTarget (browser, targetDocument);
                break;
              }
              tab = null;
            }
          }
          else if (tabbrowser.mTabContainer) {
            for (i = 0;
                 i < tabbrowser.mTabContainer.childNodes.length;
                 i ++) {
              tab = tabbrowser.mTabContainer.childNodes [i];
              var targetDocument
                = tab.linkedBrowser.contentDocument;
              if (targetDocument.location.href == link) {
                /* リロード */
                reloadTarget (tab.linkedBrowser, targetDocument);
                break;
              }
              tab = null;
            }
          }
          if (tab == null) {
            tab = tabbrowser.addTab (link);
          }
          tabbrowser.selectedTab = tab;
          break;
        }
      }
      if ("className" in node) {
        if (node.className == "akahuku_sidebar_aima") {
          var method, server, dir, num, imageNum, name;
                    
          name = node.getAttribute ("name");
          if (name
              && name
              .match (/^([^_]+)_([^_]+)_([^_]+)_([^_]+)_(.+)$/)) {
            method = RegExp.$1;
            server = RegExp.$2;
            dir = RegExp.$3;
            num = parseInt (RegExp.$4);
            imageNum = parseInt (RegExp.$5);
                        
            div = node;
            while (div) {
              if ("className" in div
                  && div.className == "akahuku_sidebar_thread") {
                break;
              }
              div = div.parentNode;
            }
            if (!div) {
              return;
            }
                        
            try {
              if (typeof Aima_Aimani != "undefined") {
                if (Aima_Aimani.changeNGNumberSidebarHandler) {
                  Aima_Aimani.changeNGNumberSidebarHandler
                    (server, dir,
                     num, imageNum, method == "hide");
                }
              }
            }
            catch (e) { Akahuku.debug.exception (e);
            }
                        
            if (method == "hide") {
              node.setAttribute ("name",
                                 "show_" + server + "_" + dir
                                 + "_" + num + "_" + imageNum);
              arAkahukuDOM.setText (node, " [\u89E3]");
                            
              nodes = div.getElementsByTagName ("img");
              if (nodes && nodes.length >= 1) {
                node = nodes [0];
                node.style.visibility = "hidden";
                node.removeAttribute ("__link");
              }
                            
              nodes = div.getElementsByTagName ("div");
              if (nodes && nodes.length >= 1) {
                node = nodes [0];
                while (node) {
                  if (node.className
                      == "akahuku_sidebar_comment") {
                    node.style.visibility = "hidden";
                  }
                  node = node.nextSibling;
                }
              }
            }
            else {
              node.setAttribute ("name",
                                 "hide_" + server + "_" + dir
                                 + "_" + num + "_" + imageNum);
              arAkahukuDOM.setText (node, " [\u6D88]");
                            
              nodes = div.getElementsByTagName ("img");
              if (nodes && nodes.length >= 1) {
                node = nodes [0];
                node.style.visibility = "";
              }
                            
              nodes = div.getElementsByTagName ("div");
              if (nodes && nodes.length >= 1) {
                node = nodes [0];
                while (node) {
                  if (node.className
                      == "akahuku_sidebar_comment") {
                    node.style.visibility = "";
                  }
                  node = node.nextSibling;
                }
              }
            }
                        
            break;
          }
        }
      }
      node = node.parentNode;
    }
  },
    
  /**
   * 0 ページで更新をクリックしたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onRefresh0 : function (event) {
    if (event.target.id.match (/^akahuku_sidebar_refresh_0_(.+)$/)) {
      var name = RegExp.$1;
      var server, dir;
      if (name.match (/^([^_]+)_(.+)$/)) {
        server = RegExp.$1;
        dir = RegExp.$2;
      }
      var sidebarDocument = event.target.ownerDocument;
            
      var iframe
      = sidebarDocument
      .getElementById ("akahuku_sidebar_iframe2_" + name);
      iframe.setAttribute ("src", "about:blank");
      iframe.setAttribute ("src",
                           "http://" + server + ".2chan.net/"
                           + dir + "/futaba.htm");
      /* futaba: ふたば内でしか動作しないので外部には対応しない */
            
      var button;
      button
      = sidebarDocument
      .getElementById ("akahuku_sidebar_refresh_0_" + name);
      if (button) {
        button.setAttribute ("disabled", "true");
      }
      button
      = sidebarDocument
      .getElementById ("akahuku_sidebar_refresh_catalog_" + name);
      if (button) {
        button.setAttribute ("disabled", "true");
      }
    }
  },
    
  /**
   * カタログで更新をクリックしたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onRefreshCatalog : function (event) {
    if (event.target.id.match (/^akahuku_sidebar_refresh_catalog_(.+)$/)) {
      var name = RegExp.$1;
      var server, dir;
      if (name.match (/^([^_]+)_(.+)$/)) {
        server = RegExp.$1;
        dir = RegExp.$2;
      }
      var sidebarDocument = event.target.ownerDocument;
            
      var iframe
      = sidebarDocument
      .getElementById ("akahuku_sidebar_iframe2_" + name);
      iframe.setAttribute ("src", "about:blank");
      iframe.setAttribute ("src",
                           "http://" + server + ".2chan.net/"
                           + dir + "/futaba.php?mode=cat");
      /* futaba: ふたば内でしか動作しないので外部には対応しない */
            
      var button;
      button
      = sidebarDocument
      .getElementById ("akahuku_sidebar_refresh_0_" + name);
      if (button) {
        button.setAttribute ("disabled", "true");
      }
      button
      = sidebarDocument
      .getElementById ("akahuku_sidebar_refresh_catalog_" + name);
      if (button) {
        button.setAttribute ("disabled", "true");
      }
    }
  },
    
  /**
   * 更新用のフレームが読み込み完了したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onIframe2Load : function (event) {
    var targetDocument = event.target;
    if (targetDocument.location.href.match
        (/^http:\/\/([^\/]+\/)?([^\.\/]+)\.2chan\.net(:[0-9]+)?\/([^\/]+)\/(.*)$/)) {
      var server = RegExp.$2;
      var dir = RegExp.$4;
      var name = server + "_" + dir;
      var path = RegExp.$5;
            
      if (path.match (/^((futaba|[0-9]+)\.htm)?([#\?].*)?$/)) {
        /* futaba: ふたば内でしか動作しないので外部には対応しない */
        arAkahukuSidebar.onNormalLoad (targetDocument, name);
      }
      else if (path.match (/\?mode=cat/)) {
        arAkahukuSidebar.onCatalogLoad (targetDocument, name);
      }
            
      arAkahukuSidebar.updateVisited (name);
      arAkahukuSidebar.sort (name);
      arAkahukuSidebar.update (name);
            
      var sidebar = arAkahukuSidebar.getSidebar ();
      if (!sidebar.docShell) {
        return;
      }
      var sidebarDocument;
      try {
        sidebarDocument = sidebar.contentDocument;
      }
      catch (e) {
        sidebarDocument = arAkahukuSidebar.currentSidebarDocument;
      }
      var button;
      button
        = sidebarDocument
        .getElementById ("akahuku_sidebar_refresh_0_" + name);
      if (button) {
        button.removeAttribute ("disabled");
      }
      button
        = sidebarDocument
        .getElementById ("akahuku_sidebar_refresh_catalog_" + name);
      if (button) {
        button.removeAttribute ("disabled");
      }
    }
  },
    
  /**
   * サイドバーをロードしたイベント
   *
   * @param  XULDocument sidebarDocument
   *         サイドバーのドキュメント
   */
  onSidebarLoad : function (sidebarDocument) {
    if (!arAkahukuSidebar.enable) {
      return;
    }
    arAkahukuSidebar.currentSidebarDocument = sidebarDocument;
        
    var container
    = sidebarDocument.getElementById ("akahuku_sidebar_tabcontainer");
    var deck = sidebarDocument.getElementById ("akahuku_sidebar_deck");
    var tab, button, box, iframe, buttons;
    var name, tmp;
        
    container.menuEventListener = arAkahukuSidebar;
        
    if (arAkahukuSidebar.enableTabVertical) {
      container.parentNode.orient = "horizontal";
      container.orient = "vertical";
    }
    if (arAkahukuSidebar.enableTabHidden) {
      container.hidden = "true";
    }
    container.enableMenuButton = arAkahukuSidebar.enableTabMenu;
        
    var popup = sidebarDocument.getElementById ("akahuku-sidebar-popup");
    if (popup) {
      popup.addEventListener
        ("popupshowing", 
         function () {
          arAkahukuSidebar.setContextMenu (arguments [0]);
        }, false);
            
      var item;
            
      item
        = sidebarDocument
        .getElementById ("akahuku-sidebar-popup-sort-num");
      if (item) {
        item.addEventListener
          ("command", 
           function () {
            arAkahukuSidebar.onSort (arguments [0], 0, 0);
          }, false);
      }
            
      item
        = sidebarDocument
        .getElementById ("akahuku-sidebar-popup-sort-lastnum");
      if (item) {
        item.addEventListener
          ("command", 
           function () {
            arAkahukuSidebar.onSort (arguments [0], 0, 1);
          }, false);
      }
            
      item
        = sidebarDocument
        .getElementById ("akahuku-sidebar-popup-sort-visited");
      if (item) {
        item.addEventListener
          ("command", 
           function () {
            arAkahukuSidebar.onSort (arguments [0], 1, 0);
          }, false);
      }
            
      item
        = sidebarDocument
        .getElementById ("akahuku-sidebar-popup-sort-marked");
      if (item) {
        item.addEventListener
          ("command", 
           function () {
            arAkahukuSidebar.onSort (arguments [0], 2, 0);
          }, false);
      }
            
      item
        = sidebarDocument
        .getElementById ("akahuku-sidebar-popup-sort-invert");
      if (item) {
        item.addEventListener
          ("command", 
           function () {
            arAkahukuSidebar.onSort (arguments [0], 3, 0);
          }, false);
      }
            
      item
        = sidebarDocument
        .getElementById ("akahuku-sidebar-popup-sort-mark");
      if (item) {
        item.addEventListener
          ("command", 
           function () {
            arAkahukuSidebar.onSort (arguments [0], 10, 0);
          }, false);
      }
      item
        = sidebarDocument
        .getElementById ("akahuku-sidebar-popup-sort-unmark");
      if (item) {
        item.addEventListener
          ("command", 
           function () {
            arAkahukuSidebar.onSort (arguments [0], 10, 1);
          }, false);
      }
    }
        
    if (Components.interfaces.nsIPrefBranch2 == undefined) {
      /* 監視していない場合にのみ設定を取得する */
      arAkahukuSidebar.getConfig ();
    }
        
        
    /* タブを作る */
    var i = 0;
    for (i = 0; i < arAkahukuSidebar.list.length; i ++) {
      tmp = arAkahukuSidebar.list [i];
      name = tmp.replace (/:/, "_");
            
      if (name in arAkahukuSidebar.boards) {
        var board, thread;
        board = arAkahukuSidebar.boards [name];
        board.lastSelected = null;
        board.lastSelectedImage = null;
        for (var j = 0; j < board.threads.length; j ++) {
          thread = board.threads [j];
          thread.node = null;
        }
      }
            
      tab = sidebarDocument.createElement ("button");
      tab.id = "akahuku_sidebar_tab_" + name;
      tab.className = "tab";
      tab.orient = "vertical";
      tab.align = "center";
      tab.setAttribute ("__item_label", arAkahukuServerShortName.get (tmp));
      tab.setAttribute ("__item_value", tmp);
      var n1 = arAkahukuServerShortName.get (tmp);
      var n2 = "";
      if (n1.length > 4) {
        if (n1.match (/^([^A-Za-z ]+)([A-Za-z]+)$/)) {
          n1 = RegExp.$1;
          n2 = RegExp.$2;
        }
        else if (n1.match (/^([\u3041-\u3093\u30FC]+)([^\u3041-\u3093\u30FC]+)$/)) {
          n1 = RegExp.$1;
          n2 = RegExp.$2;
        }
        else if (n1.match (/^([\u30A1-\u30F6\u30FC]+)([^\u30A1-\u30F6\u30FC]+)$/)) {
          n1 = RegExp.$1;
          n2 = RegExp.$2;
        }
        else if (n1.match (/^([^\u3041-\u3093\u30FC]+)([\u3041-\u3093\u30FC]+)$/)) {
          n1 = RegExp.$1;
          n2 = RegExp.$2;
        }
        else if (n1.match (/^([^\u30A1-\u30F6\u30FC]+)([\u30A1-\u30F6\u30FC]+)$/)) {
          n1 = RegExp.$1;
          n2 = RegExp.$2;
        }
        else if (n1.match (/^(.+) ([A-Za-z]+)$/)) {
          n1 = RegExp.$1;
          n2 = RegExp.$2;
        }
        else if (n1.match (/^([^A-Za-z][^A-Za-z][^A-Za-z])([^A-Za-z]+)$/)) {
          n1 = RegExp.$1;
          n2 = RegExp.$2;
        }
      }
      var l1 = sidebarDocument.createElement ("label");
      l1.setAttribute ("value", n1);
      tab.appendChild (l1);
      if (n2) {
        var l2 = sidebarDocument.createElement ("label");
        l2.setAttribute ("value", n2);
        tab.appendChild (l2);
      }
      if (i == 0) {
        tab.setAttribute ("selected", "true");
      }
      tab.addEventListener
        ("command",
         function () {
          arAkahukuSidebar.onTabClick (arguments [0]);
        }, false);
      container.appendChild (tab);
            
      box = sidebarDocument.createElement ("box");
      box.id = "akahuku_sidebar_deck_" + name;
      box.setAttribute ("flex", "1");
      box.setAttribute ("orient", "vertical");
      buttons = sidebarDocument.createElement ("box");
      buttons.className = "buttons";
      buttons.id = "akahuku_sidebar_buttons_" + name;
      button = sidebarDocument.createElement ("button");
      button.id = "akahuku_sidebar_refresh_0_" + name;
      button.className = "refresh";
      button.setAttribute ("label", "0 \u30DA\u30FC\u30B8");
      button.addEventListener
        ("command",
         function () {
          arAkahukuSidebar.onRefresh0 (arguments [0]);
        }, false);
      buttons.appendChild (button);
      if (arAkahukuCatalogBoards.has (tmp)) {
        button = sidebarDocument.createElement ("button");
        button.id = "akahuku_sidebar_refresh_catalog_" + name;
        button.className = "refresh";
        button.setAttribute ("label", "\u30AB\u30BF\u30ED\u30B0");
        button.addEventListener
          ("command",
           function () {
            arAkahukuSidebar.onRefreshCatalog (arguments [0]);
          }, false);
        buttons.appendChild (button);
      }
      iframe = sidebarDocument.createElement ("iframe");
      iframe.id = "akahuku_sidebar_iframe2_" + name;
      iframe.style.height = "0px";
      iframe.style.width = "0px";
      iframe.style.visibility = "hidden";
      iframe.addEventListener
        ("DOMContentLoaded",
         function () {
          arAkahukuSidebar.onIframe2Load (arguments [0]);
        }, false);
      iframe.addEventListener
        ("load",
         function () {
          arAkahukuSidebar.onIframe2Load (arguments [0]);
        }, false);
      buttons.appendChild (iframe);
      box.appendChild (buttons);
      iframe = sidebarDocument.createElement ("iframe");
      iframe.id = "akahuku_sidebar_iframe_" + name;
      iframe.setAttribute ("src",
                           "chrome://akahuku/content/sidebar_html.html");
      iframe.setAttribute ("flex", "1");
      setTimeout (function (name) {
          try {
            arAkahukuSidebar.updateVisited (name);
                        
            arAkahukuSidebar.sort (name);
                        
            arAkahukuSidebar.update (name);
          }
          catch (e) { Akahuku.debug.exception (e);
          }
        }, 1000, name);
            
      box.appendChild (iframe);
      deck.appendChild (box);
      if (i == 0) {
        deck.selectedPanel = box;
      }
    }
    if (arAkahukuSidebar.enableMarked) {
      tmp = "*:*";
      name = tmp.replace (/:/, "_");
            
      tab = sidebarDocument.createElement ("button");
      tab.id = "akahuku_sidebar_tab_" + name;
      tab.className = "tab";
      tab.orient = "vertical";
      tab.align = "center";
      tab.setAttribute ("__item_label", "\u30DE\u30FC\u30AF");
      tab.setAttribute ("__item_value", tmp);
      n1 = "\u30DE\u30FC\u30AF";
      var l1 = sidebarDocument.createElement ("label");
      l1.setAttribute ("value", n1);
      tab.appendChild (l1);
      if (i == 0) {
        tab.setAttribute ("selected", "true");
      }
      tab.addEventListener
      ("command",
       function () {
        arAkahukuSidebar.onTabClick (arguments [0]);
      }, false);
      container.appendChild (tab);
            
      box = sidebarDocument.createElement ("box");
      box.id = "akahuku_sidebar_deck_" + name;
      box.setAttribute ("flex", "1");
      box.setAttribute ("orient", "vertical");
      iframe = sidebarDocument.createElement ("iframe");
      iframe.id = "akahuku_sidebar_iframe_" + name;
      iframe.setAttribute ("src",
                           "chrome://akahuku/content/sidebar_html.html");
      iframe.setAttribute ("flex", "1");
      setTimeout (function (name) {
          try {
            arAkahukuSidebar.updateVisited (name);
                        
            arAkahukuSidebar.sort (name);
                        
            arAkahukuSidebar.update (name);
          }
          catch (e) { Akahuku.debug.exception (e);
          }
        }, 1000, name);
            
      box.appendChild (iframe);
      deck.appendChild (box);
      if (i == 0) {
        deck.selectedPanel = box;
      }
    }
    var spacer = sidebarDocument.createElement ("spacer");
    spacer.className = "tabspace";
    spacer.setAttribute ("flex", "1");
    container.appendChild (spacer);
  },
    
  /**
   * タブのメニュー項目が選択されたイベント
   *
   * @param  String value
   *         メニュー項目に対応するタブ
   */
  onSelectItem : function (tab) {
    arAkahukuSidebar.onTabClickCore (tab);
  },
    
  /**
   * メニューが開かれるイベント
   * メニューの項目の表示／非表示を設定する
   *
   * @param  Event event
   *         対象のイベント
   */
  setContextMenu : function (event) {
    var sidebar = arAkahukuSidebar.getSidebar ();
    if (!sidebar.docShell) {
      return;
    }
    var sidebarDocument;
    try {
      sidebarDocument = sidebar.contentDocument;
    }
    catch (e) {
      sidebarDocument = arAkahukuSidebar.currentSidebarDocument;
    }
    var item;
        
    item
    = sidebarDocument.getElementById ("akahuku-sidebar-popup-sort-num");
    if (item) {
      item.setAttribute ("checked", arAkahukuSidebar.sortType == 0);
    }
        
    item
    = sidebarDocument.getElementById ("akahuku-sidebar-popup-sort-lastnum");
    if (item) {
      item.setAttribute ("checked", arAkahukuSidebar.sortType == 1);
    }
        
    item
    = sidebarDocument.getElementById ("akahuku-sidebar-popup-sort-visited");
    if (item) {
      item.setAttribute ("checked", arAkahukuSidebar.enableSortVisited);
    }
        
    item
    = sidebarDocument.getElementById ("akahuku-sidebar-popup-sort-marked");
    if (item) {
      item.setAttribute ("checked", arAkahukuSidebar.enableSortMarked);
    }
        
    item
    = sidebarDocument.getElementById ("akahuku-sidebar-popup-sort-invert");
    if (item) {
      item.setAttribute ("checked", arAkahukuSidebar.sortInvert);
    }
        
    var deck
    = sidebarDocument.getElementById ("akahuku_sidebar_deck");
    var box = deck.selectedPanel;
        
    if (box.id.match (/^akahuku_sidebar_deck_(.+)$/)) {
      var name = RegExp.$1;
      var board;
            
      if (name in arAkahukuSidebar.boards) {
        board = arAkahukuSidebar.boards [name];
      }
      else {
        board = new arAkahukuSidebarBoard ();
        arAkahukuSidebar.boards [name] = board;
      }
            
      if (board.lastSelected) {
        var num = board.lastSelected.getAttribute ("__num");
        var thread = board.getThread (num);
                
        item
          = sidebarDocument
          .getElementById ("akahuku-sidebar-popup-sort-mark");
        if (item) {
          if (thread.isMarked) {
            item.setAttribute ("hidden", "true");
          }
          else {
            item.removeAttribute ("hidden");
          }
        }
                
        item
          = sidebarDocument
          .getElementById ("akahuku-sidebar-popup-sort-unmark");
        if (item) {
          if (!thread.isMarked) {
            item.setAttribute ("hidden", "true");
          }
          else {
            item.removeAttribute ("hidden");
          }
        }
                
        item
          = sidebarDocument
          .getElementById ("akahuku-sidebar-popup-separator1");
        if (item) {
          item.removeAttribute ("hidden");
        }
      }
      else {
        item
          = sidebarDocument
          .getElementById ("akahuku-sidebar-popup-sort-mark");
        if (item) {
          item.setAttribute ("hidden", "true");
        }
        item
          = sidebarDocument
          .getElementById ("akahuku-sidebar-popup-sort-unmark");
        if (item) {
          item.setAttribute ("hidden", "true");
        }
        item
          = sidebarDocument
          .getElementById ("akahuku-sidebar-popup-separator1");
        if (item) {
          item.setAttribute ("hidden", "true");
        }
      }
    }
  },
    
  /**
   * ソートするイベント
   *
   * @param  Event event
   *         対象のイベント
   * @param  String type
   *         イベントの種類
   *           0: ソート
   *           1: 既読のスレを上に持ってくる
   *           2: マークしたスレを上に持ってくる
   *           3: ソートを反転
   *           10: マークを変更
   * @param  String sorttype
   *         ソートの種類
   *           0: スレの立った順
   *           1: 最終レス番号順
   *         マークの状態
   *           0: マークする
   *           1: マークを外す
   */
  onSort : function (event, type, sorttype) {
    var sidebar = arAkahukuSidebar.getSidebar ();
    if (!sidebar.docShell) {
      return;
    }
    var sidebarDocument;
    try {
      sidebarDocument = sidebar.contentDocument;
    }
    catch (e) {
      sidebarDocument = arAkahukuSidebar.currentSidebarDocument;
    }
    var deck = sidebarDocument.getElementById ("akahuku_sidebar_deck");
    var box = deck.selectedPanel;
        
    if (box.id.match (/^akahuku_sidebar_deck_(.+)$/)) {
      var name = RegExp.$1;
            
      if (type == 0) {
        arAkahukuSidebar.sortType = sorttype;
        arAkahukuConfig.prefBranch
          .setIntPref ("akahuku.sidebar.sort.type",
                       arAkahukuSidebar.sortType);
      }
      else if (type == 1) {
        arAkahukuSidebar.enableSortVisited
          = !arAkahukuSidebar.enableSortVisited;
        arAkahukuConfig.prefBranch
          .setBoolPref ("akahuku.sidebar.sort.visited",
                        arAkahukuSidebar.enableSortVisited);
      }
      else if (type == 2) {
        arAkahukuSidebar.enableSortMarked
          = !arAkahukuSidebar.enableSortMarked;
                
        arAkahukuConfig.prefBranch
          .setBoolPref ("akahuku.sidebar.sort.marked",
                        arAkahukuSidebar.enableSortMarked);
      }
      else if (type == 3) {
        arAkahukuSidebar.sortInvert = !arAkahukuSidebar.sortInvert;
        arAkahukuConfig.prefBranch
          .setBoolPref ("akahuku.sidebar.sort.invert",
                        arAkahukuSidebar.sortInvert);
      }
      else if (type == 10) {
        if (name in arAkahukuSidebar.boards) {
          board = arAkahukuSidebar.boards [name];
                    
          if (board.lastSelected) {
            var num = board.lastSelected.getAttribute ("__num");
            var thread = board.getThread (num);
            thread.isMarked = (sorttype == 0);
          }
        }
      }
            
      arAkahukuSidebar.updateVisited (name);
            
      arAkahukuSidebar.sort (name);
            
      arAkahukuSidebar.update (name);
      if (arAkahukuSidebar.enableMarked) {
        arAkahukuSidebar.updateMarked ();
        arAkahukuSidebar.sort ("*_*");
        arAkahukuSidebar.update ("*_*");
      }
    }
  },
    
  /**
   * タブをクリックしたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onTabClick : function (event) {
    arAkahukuSidebar.onTabClickCore (event.target);
  },
    
  /**
   * タブをクリックしたイベント
   *
   * @param  XULElement tab
   *         対象のタブ
   */
  onTabClickCore : function (tab) {
    if (tab.id.match (/^akahuku_sidebar_tab_(.+)$/)) {
      var sidebarDocument = tab.ownerDocument;
            
      var container
      = sidebarDocument.getElementById ("akahuku_sidebar_tabcontainer");
      for (var tab2 = container.firstChild; tab2;
           tab2 = tab2.nextSibling) {
        if (tab2 == tab) {
          tab2.setAttribute ("selected", "true");
        }
        else {
          tab2.removeAttribute ("selected");
        }
      }
            
      var name = RegExp.$1;
      var deck = sidebarDocument.getElementById ("akahuku_sidebar_deck");
      var box
      = sidebarDocument.getElementById ("akahuku_sidebar_deck_" + name);
      deck.selectedPanel = box;
    }
  },
    
  /**
   * サイドバーを更新する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  arAkahukuLocationInfo info
   *         アドレスの情報
   */
  apply : function (targetDocument, info) {
    if (arAkahukuSidebar.enable
        && info.isFutaba) {
      var name = info.server + "_" + info.dir;
            
      if (!arAkahukuSidebar.enableBackground) {
        var sidebar = arAkahukuSidebar.getSidebar ();
        if (!sidebar.docShell) {
          return;
        }
        var sidebarDocument;
        try {
          sidebarDocument = sidebar.contentDocument;
        }
        catch (e) {
          sidebarDocument = arAkahukuSidebar.currentSidebarDocument;
        }
        var iframe
          = sidebarDocument
          .getElementById ("akahuku_sidebar_iframe_" + name);
        if (iframe == null) {
          return;
        }
      }
            
      var exists = false;
      for (var i = 0; i < arAkahukuSidebar.list.length; i ++) {
        if (name == arAkahukuSidebar.list [i].replace (/:/, "_")) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        return;
      }
            
      if (info.isNormal) {
        arAkahukuSidebar.onNormalLoad (targetDocument, name);
      }
      else if (info.isReply) {
        if (info.isNotFound) {
          var name;
          name = info.server + "_" + info.dir;
          arAkahukuSidebar.onThreadExpired (name, info.threadNumber);
        }
        else {
          arAkahukuSidebar.onReplyLoad (targetDocument, name);
        }
      }
      else if (info.isCatalog) {
        if (!arAkahukuSidebar.enableCheckCatalog) {
          return;
        }
        arAkahukuSidebar.onCatalogLoad (targetDocument, name);
      }
            
      arAkahukuSidebar.updateVisited (name);
      arAkahukuSidebar.sort (name);
      arAkahukuSidebar.update (name);
            
      if (arAkahukuSidebar.enableMarked) {
        arAkahukuSidebar.sort ("*_*");
        arAkahukuSidebar.update ("*_*");
      }
    }
  }
};
