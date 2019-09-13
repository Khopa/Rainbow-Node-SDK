"use strict";
import {XMPPService} from "./connection/XMPPService";
import {RESTService} from "./connection/RESTService";
import {HTTPService} from "./connection/HttpService";
import {isNullOrUndefined} from "util";

export {};


const Logger = require("./common/Logger");
const IMService = require("./services/ImsService");
const PresenceService = require("./services/PresenceService");
const ChannelsService = require("./services/ChannelsService");
const ContactsService = require("./services/ContactsService");
const ConversationsService = require("./services/ConversationsService");
const Profiles = require("./services/ProfilesService");
const TelephonyService = require("./services/TelephonyService");
const BubblesService = require("./services/BubblesService");
const GroupsService = require("./services/GroupsService");
const AdminService = require("./services/AdminService");
const SettingsService = require("./services/SettingsService");
const FileServer = require("./services/FileServerService");
const FileStorage = require("./services/FileStorageService");
const StateManager = require("./common/StateManager");
const CallLogService = require( "./services/CallLogService");
const FavoritesService = require( "./services/FavoritesService");

const Events = require("./common/Events");

const Options = require("./config/Options");
const ProxyImpl = require("./ProxyImpl");

const packageVersion = require("../package.json");

let _signin;
let _retrieveInformation;

const LOG_ID = "CORE - ";

class Core {
	public _signin: any;
	public _retrieveInformation: any;
	public onTokenRenewed: any;
	public logger: any;
	public _rest: RESTService;
	public onTokenExpired: any;
	public _eventEmitter: any;
	public _tokenSurvey: any;
	public options: any;
	public _proxy: any;
	public _http: any;
	public _xmpp: XMPPService;
	public _stateManager: any;
	public _im: any;
	public _presence: any;
	public _channels: any;
	public _contacts: any;
	public _conversations: any;
	public _profiles: any;
	public _telephony: any;
	public _bubbles: any;
	public _groups: any;
	public _admin: any;
	public _settings: any;
	public _fileServer: any;
	public _fileStorage: any;
    public _calllog: any;
    public _favorites: any;
	public _botsjid: any;

    constructor(options) {

        let self = this;

        self._signin = (forceStopXMPP) => {
            let that = self;
            that.logger.log("debug", LOG_ID + "(signin) _entering_");

            let json = null;

            return new Promise(function (resolve, reject) {

                return that._xmpp.stop(forceStopXMPP).then(() => {
                    return that._rest.signin();
                }).then((_json) => {
                    json = _json;
                    let headers = {
                        "headers": {
                            "Authorization": "Bearer " + that._rest.token,
                            "x-rainbow-client": "sdk_node",
                            "x-rainbow-client-version": packageVersion.version
                            // "Accept": accept || "application/json",
                        }
                    };
                    return that._xmpp.signin(that._rest.loggedInUser, headers);
                }).then(function () {
                    that.logger.log("debug", LOG_ID + "(signin) signed in successfully");
                    that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                    resolve(json);
                }).catch(function (err) {
                    that.logger.log("error", LOG_ID + "(signin) can't signed-in.");
                    that.logger.log("internalerror", LOG_ID + "(signin) can't signed-in", err);
                    that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                    reject(err);
                });
            });
        };

        self._retrieveInformation = (useCLIMode) => {
            let that = self;
            that.logger.log("debug", LOG_ID + "(_retrieveInformation) useCLIMode : ", useCLIMode);
            return new Promise((resolve, reject) => {

                if (useCLIMode) {
                    resolve();
                } else {
                    return that._contacts.getRosters()
                        .then(() => {
                            return that._profiles.init();
                        }).then(() => {
                            return that._telephony.init();
                        }).then(() => {
                            return that._contacts.init();
                        }).then(() => {
                            return that._fileStorage.init();
                        }).then(() => {
                            return that._fileServer.init();
                        }).then(() => {
                            return that.presence._sendPresenceFromConfiguration();
                        }).then(() => {
                            return that._bubbles.getBubbles();
                        }).then(() => {
                            return that._channels.fetchMyChannels();
                        }).then(() => {
                            return that._groups.getGroups();
                        }).then(() => {
                            return that.presence.sendInitialPresence();
                        }).then(() => {
                            return that.im.enableCarbon();
                        }).then(() => {
                            return that._rest.getBots();
                        }).then((bots) => {
                            that._botsjid = bots ? bots.map((bot) => {
                                return bot.jid;
                            }) : [];
                            return Promise.resolve();
                        }).then(() => {
                            return that._conversations.getServerConversations();
                        }).then(() => {
                            return that._calllog.init();
                        }).then(() => {
                            return that._favorites.init();
                        }).then(() => {
                            resolve();
                        }).catch((err) => {
                            that.logger.log("error", LOG_ID + "(_retrieveInformation) !!! CATCH  Error while initializing services.");
                            that.logger.log("internalerror", LOG_ID + "(_retrieveInformation) !!! CATCH  Error while initializing services : ", err);
                            reject(err);
                        });
                }
            });
        };

        self.onTokenRenewed = function onTokenRenewed() {
            self.logger.log("info", LOG_ID +  "(tokenSurvey) token successfully renewed");
            self._rest.startTokenSurvey();
        };

        self.onTokenExpired = function onTokenExpired() {
            self.logger.log("info", LOG_ID +  "(tokenSurvey) token expired. Signin required");
/*
            self._eventEmitter.iee.removeListener("rainbow_tokenrenewed", self.onTokenRenewed.bind(self));
            self._eventEmitter.iee.removeListener("rainbow_tokenexpired", self.onTokenExpired.bind(self));
*/
            self._eventEmitter.iee.emit("evt_internal_signinrequired");
        };

        self._tokenSurvey = () => {
            let that = self;
            that.logger.log("debug", LOG_ID +  "(tokenSurvey) _enter_");

            if (that.options.useCLIMode) {
                that.logger.log("info", LOG_ID +  "(tokenSurvey) No token survey in CLI mode");
                return;
            }

/*
            that._eventEmitter.iee.removeListener("rainbow_tokenrenewed", that.onTokenRenewed.bind(that));
            that._eventEmitter.iee.removeListener("rainbow_tokenexpired", that.onTokenExpired.bind(that));
            that._eventEmitter.iee.on("rainbow_tokenrenewed", that.onTokenRenewed.bind(that));
            that._eventEmitter.iee.on("rainbow_tokenexpired", that.onTokenExpired.bind(that));
*/
            that._rest.startTokenSurvey();
        };

        // Initialize the logger
        let loggerModule = new Logger(options);
        self.logger = loggerModule.log;
        self.logger.log("debug", LOG_ID + "(constructor) _entering_");
        self.logger.log("debug", LOG_ID + "(constructor) ------- SDK INFORMATION -------");

        self.logger.log("info", LOG_ID + " (constructor) SDK version: " + packageVersion.version);
        self.logger.log("info", LOG_ID + " (constructor) Node version: " + process.version);
        for (let key in process.versions) {
            self.logger.log("info", LOG_ID + " (constructor) " + key + " version: " + process.versions[key]);
        }
        self.logger.log("debug", LOG_ID + "(constructor) ------- SDK INFORMATION -------");

        // Initialize the options

        self.options = new Options(options, self.logger);
        self.options.parse();

        // Initialize the Events Emitter
        self._eventEmitter = new Events(self.logger, (jid) => {
            return self._botsjid.includes(jid);
        });
        self._eventEmitter.setCore(self);
        self._eventEmitter.iee.on("evt_internal_signinrequired", function () {
            self.signin(true);
        });
        self._eventEmitter.iee.on("rainbow_application_token_updated", function (token) {
            self._rest.applicationToken = token;
        });

        self._eventEmitter.iee.on("rainbow_onxmpperror", function (err) {
            self._stateManager.transitTo(self._stateManager.ERROR, err);
        });

        self._eventEmitter.iee.on("rainbow_xmppreconnected", function () {
            let that = self;
            //todo, check that REST part is ok too
            self._rest.reconnect().then((data) => {
                self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) reconnect succeed : so change state to connected");
                self.logger.log("internal", LOG_ID + " (rainbow_xmppreconnected) reconnect succeed : ", data, " so change state to connected");
                return self._stateManager.transitTo(self._stateManager.CONNECTED).then((data2) => {
                    self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) transition to connected succeed.");
                    self.logger.log("internal", LOG_ID + " (rainbow_xmppreconnected) transition to connected succeed : ", data2);
                    return self._retrieveInformation(self.options.useCLIMode);
                });
            }).then((data3) => {
                self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) _retrieveInformation succeed, change state to ready");
                self.logger.log("internal", LOG_ID + " (rainbow_xmppreconnected) _retrieveInformation succeed : ", data3,  " change state to ready");
                self._stateManager.transitTo(self._stateManager.READY).then((data4) => {
                    self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) transition to ready succeed.");
                    self.logger.log("internal", LOG_ID + " (rainbow_xmppreconnected) transition to ready succeed : ", data4);
                });
            }).catch(async (err) => {
                // If not already connected, it is an error in xmpp connection, so should failed
                if (!self._stateManager.isCONNECTED()) {
                    self.logger.log("error", LOG_ID + " (rainbow_xmppreconnected) REST connection ", self._stateManager.FAILED);
                    self.logger.log("internalerror", LOG_ID + " (rainbow_xmppreconnected) REST connection ", self._stateManager.FAILED, ", ErrorManager : ", err);
                    await self._stateManager.transitTo(self._stateManager.FAILED);
                } else {
                    self.logger.log("warn", LOG_ID + " (rainbow_xmppreconnected) REST reconnection Error, set state : ", self._stateManager.DISCONNECTED);
                    self.logger.log("internalerror", LOG_ID + " (rainbow_xmppreconnected) REST reconnection ErrorManager : ", err, ", set state : ", self._stateManager.DISCONNECTED);
                    // ErrorManager in REST micro service, so let say it is disconnected
                    await self._stateManager.transitTo(self._stateManager.DISCONNECTED);
                    // relaunch the REST connection.
                    self._eventEmitter.iee.emit("rainbow_xmppreconnected");
                }
            });
        });

        self._eventEmitter.iee.on("rainbow_xmppreconnectingattempt", async function () {
            await self._stateManager.transitTo(self._stateManager.RECONNECTING);
        });

        self._eventEmitter.iee.on("rainbow_xmppdisconnect", async function (xmppDisconnectInfos) {
            if (xmppDisconnectInfos && xmppDisconnectInfos.reconnect) {
                self.logger.log("info", LOG_ID + " (rainbow_xmppdisconnect) set to state : ", self._stateManager.DISCONNECTED);
                await self._stateManager.transitTo(self._stateManager.DISCONNECTED);
            }  else {
                self.logger.log("info", LOG_ID + " (rainbow_xmppdisconnect) set to state : ", self._stateManager.STOPPED);
                await self._stateManager.transitTo(self._stateManager.STOPPED);
            }
        });

        self._eventEmitter.iee.on("rainbow_tokenrenewed", self.onTokenRenewed.bind(self));
        self._eventEmitter.iee.on("rainbow_tokenexpired", self.onTokenExpired.bind(self));

        if (self.options.useXMPP) {
            self.logger.log("info", LOG_ID + "(constructor) used in XMPP mode");
        }
        else {
            if (self.options.useCLIMode) {
                self.logger.log("info", LOG_ID + "(constructor) used in CLI mode");
            }
            else {
                self.logger.log("info", LOG_ID + "(constructor) used in HOOK mode");
            }
        }

        // Instantiate basic service
        self._proxy = new ProxyImpl(self.options.proxyOptions, self.logger);
        self._http = new HTTPService(self.options.httpOptions, self.logger, self._proxy, self._eventEmitter.iee);
        self._rest = new RESTService(self.options.credentials, self.options.applicationOptions, self.options._isOfficialRainbow(), self._eventEmitter.iee, self.logger);
        self._xmpp = new XMPPService(self.options.xmppOptions, self.options.imOptions, self.options.applicationOptions, self._eventEmitter.iee, self.logger, self._proxy);

        // Instantiate State Manager
        self._stateManager = new StateManager(self._eventEmitter, self.logger);

        // Instantiate others Services
        self._im = new IMService(self._eventEmitter.iee, self.logger, self.options.imOptions, self.options.servicesToStart.im);
        self._presence = new PresenceService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.presence);
        self._channels = new ChannelsService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.channels);
        self._contacts = new ContactsService(self._eventEmitter.iee, self.options.httpOptions, self.logger, self.options.servicesToStart.contacts);
        self._conversations = new ConversationsService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.conversations);
        self._profiles = new Profiles.ProfilesService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.profiles);
        self._telephony = new TelephonyService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.telephony);
        self._bubbles = new BubblesService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.bubbles);
        self._groups = new GroupsService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.groups);
        self._admin = new AdminService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.admin);
        self._settings = new SettingsService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.settings);
        self._fileServer = new FileServer(self._eventEmitter.iee, self.logger, self.options.servicesToStart.fileServer);
        self._fileStorage = new FileStorage(self._eventEmitter.iee, self.logger, self.options.servicesToStart.fileStorage);
        self._calllog = new CallLogService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.calllog);
        self._favorites = new FavoritesService(self._eventEmitter.iee,self.logger, self.options.servicesToStart.favorites);

        self._botsjid = [];

        self.logger.log("debug", LOG_ID + "(constructor) _exiting_");
    }

    start(useCLIMode) {
        let that = this;

        this.logger.log("debug", LOG_ID + "(start) _entering_");

        return new Promise(function (resolve, reject) {

            try {

                if (!that.options.hasCredentials) {
                    that.logger.log("error", LOG_ID + "(start) No credentials. Stop loading...");
                    that.logger.log("debug", LOG_ID + "(start) _exiting_");
                    reject("Credentials are missing. Check your configuration!");
                }
                else {
                    that.logger.log("debug", LOG_ID + "(start) start all modules");
                    that.logger.log("internal", LOG_ID + "(start) start all modules for user : ", that.options.credentials.login);
                    that.logger.log("internal", LOG_ID + "(start) servicesToStart : ", that.options.servicesToStart);


                    return that._stateManager.start().then(() => {
                        return that._http.start();
                    }).then(() => {
                        return that._rest.start(that._http);
                    }).then(() => {
                        return that._xmpp.start(that.options.useXMPP);
                    }).then(() => {
                        return that._settings.start(that._xmpp, that._rest);
                    }).then(() => {
                        return that._presence.start(that._xmpp, that._settings) ;
                    }).then(() => {
                        return  that._contacts.start(that._xmpp, that._rest) ;
                    }).then(() => {
                       return that._bubbles.start(that._xmpp, that._rest) ;
                    }).then(() => {
                        return that._conversations.start(that._xmpp, that._rest, that._contacts, that._bubbles, that._fileStorage, that._fileServer) ;
                    }).then(() => {
                        return that._profiles.start(that._xmpp, that._rest) ;
                    }).then(() => {
                        return that._telephony.start(that._xmpp, that._rest, that._contacts, that._bubbles, that._profiles) ;
                    }).then(() => {
                        return that._im.start(that._xmpp, that._conversations, that._bubbles, that._fileStorage) ;
                    }).then(() => {
                        return that._channels.start(that._xmpp, that._rest) ;
                    }).then(() => {
                        return that._groups.start(that._xmpp, that._rest) ;
                    }).then(() => {
                        return that._admin.start(that._xmpp, that._rest) ;
                    }).then(() => {
                        return that._fileServer.start(that._xmpp, that._rest, that._fileStorage) ;
                    }).then(() => {
                        return that._fileStorage.start(that._xmpp, that._rest, that._fileServer, that._conversations) ;
                    }).then(() => {
                        return that._calllog.start(that._xmpp, that._rest, that._contacts, that._profiles, that._telephony) ;
                    }).then(() => {
                        return that._favorites.start(that._xmpp, that._rest) ;
                    }).then(() => {
                        that.logger.log("debug", LOG_ID + "(start) all modules started successfully");
                        that._stateManager.transitTo(that._stateManager.STARTED).then(() => {
                            that.logger.log("debug", LOG_ID + "(start) _exiting_");
                            resolve();
                        }).catch((err) => {
                            reject(err);
                        });
                    }).catch((err) => {
                        that.logger.log("error", LOG_ID + "(start) !!! CATCH Error during bulding services instances.");
                        that.logger.log("internalerror", LOG_ID + "(start) !!! CATCH Error during bulding services instances : ", err);
                        that.logger.log("debug", LOG_ID + "(start) _exiting_");
                        reject(err);
                    });
                }

            } catch (err) {
                that.logger.log("error", LOG_ID + "(start)");
                that.logger.log("internalerror", LOG_ID + "(start)", err.message);
                that.logger.log("debug", LOG_ID + "(start) _exiting_");
                reject(err);
            }
        });
    }

    signin(forceStopXMPP) {

        let that = this;
        return new Promise(function (resolve, reject) {

            let json = null;

            return that._signin(forceStopXMPP).then(function (_json) {
                json = _json;
                that._tokenSurvey();
                return that._stateManager.transitTo(that._stateManager.CONNECTED).then(() => {
                    return that._retrieveInformation(that.options.useCLIMode);
                });
            }).then(() => {
                that._stateManager.transitTo(that._stateManager.READY).then(() => {
                    resolve(json);
                }).catch((err)=> { reject(err); });
            }).catch((err) => {
                reject(err);
            });
        });
    }

    stop() {
        let that = this;
        this.logger.log("debug", LOG_ID + "(stop) _entering_");

        return new Promise(function (resolve, reject) {

            that.logger.log("debug", LOG_ID + "(stop) stop all modules");

            that._rest.stop().then(() => {
                return that._http.stop();
            }).then(() => {
                return that._xmpp.stop(that.options.useXMPP);
            }).then(() => {
                return that._im.stop();
            }).then(() => {
                return that._settings.stop();
            }).then(() => {
                return that._presence.stop();
            }).then(() => {
                return that._conversations.stop();
            }).then(() => {
                return that._telephony.stop();
            }).then(() => {
                return that._contacts.stop();
            }).then(() => {
                return that._bubbles.stop();
            }).then(() => {
                return that._channels.stop();
            }).then(() => {
                return that._groups.stop();
            }).then(() => {
                return that._admin.stop();
            }).then(() => {
                return that._fileServer.stop();
            }).then(() => {
                return that._fileStorage.stop();
            }).then(() => {
                return that._stateManager.stop();
            }).then(() => {
                return that._calllog.stop();
            }).then(() => {
                return that._favorites.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) _exiting_");
                resolve();
            }).catch((err) => {
                reject(err);
            });
        });
    }

    get settings() {
        return this._settings;
    }

    get presence() {
        return this._presence;
    }

    get im() {
        return this._im;
    }

    get contacts() {
        return this._contacts;
    }

    get conversations() {
        return this._conversations;
    }

    get channels() {
        return this._channels;
    }

    get bubbles() {
        return this._bubbles;
    }

    get groups() {
        return this._groups;
    }

    get admin() {
        return this._admin;
    }

    get fileServer() {
        return this._fileServer;
    }

    get fileStorage() {
        return this._fileStorage;
    }

    get events() {
        return this._eventEmitter;
    }

    get rest() {
        return this._rest;
    }

    get state() {
        return this._stateManager.state;
    }

    get version() {
        return packageVersion.version;
    }

    get telephony() {
        return this._telephony;
    }

    get calllog() {
        return this._calllog;
    }
}

module.exports = Core;
