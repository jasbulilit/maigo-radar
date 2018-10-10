import * as moment from 'moment-timezone/moment-timezone';
import { QRCodeService } from './qrcode.service';
import { RadarBeaconAttachmentService } from './radar-attachment.service';
import { RadarService } from './radar.service';
import { BeaconDetection } from './radar-detection.service';
import { UserService, User } from './user.service';
import {
    LineApiService,
    LineMessageText, LineMessageImage, LineMessageImageMap,
    LineMessageTemplate, LineMessageTemplateButton,
    LineActionPostback
} from './line-api.service'

var emoji = (code) => {
    var hex2bin = function(num) {
        return parseInt(num, 16).toString(2);
    }
}

export class LineBotService {
    private apiService = new LineApiService();
    private source;

    constructor(
		private config,
		private stage
    ) {
		this.apiService.channelAccessToken = config.channelAccessToken[stage];
	}

    setSource(source) {
        this.source = source;
    }

    isPrivateTalk(): boolean {
        return (this.source.groupId || this.source.roomId) ? false : true;
    }

    findKeywordAction(message: string) {
        var keyword = this.config.keywords.find((val, i) => {
                for (var j = 0; j < val.keywords.length; j++) {
                        if (message.indexOf(val.keywords[j]) != -1) {
                            return true;
                        }
                }
                return false;
        });
        return (keyword) ? keyword.action : null;
    }

    findPostbackAction(actionName: string) {
        var postback = this.config.postbacks.find((val, i) => {
            return (val.name == actionName);
        });
        return (postback) ? postback.action : null;
    }

    follow(replyToken: string): Promise<any> {
        console.log('FOLLOWED', this._userId());
        return this.initRadar(replyToken);
    }

    join(replyToken: string): Promise<any> {
        console.log('JOIN', this.source);
        return Promise.resolve();
    }

    replyMessage(replyToken: string, message: string): Promise<any> {
        return this.apiService.sendReply(replyToken, [new LineMessageText(message)]);
    }

    initRadar(replyToken: string): Promise<void> {
        var results = [];
        results.push(this.apiService.setUserRichMenu(this._userId(), this.config.menus[this.stage].join));
        results.push((new UserService()).delete(this._userId()));

        return Promise.all(results)
            .then(() => {
                console.log('INIT RADAR', 'userId:' + this._userId());
                if (this._isDebug()) {
                    this.replyMessage(replyToken, 'DEBUG: 迷子レーダーを初期化しました。');
                }
            });
    }

    sendUserQrcode(replyToken: string): Promise<any> {
        if (! this._userId()) {
            return this.replyMessage(replyToken, "公式アカウントの利用条件に同意していないとユーザー情報が登録できないよ。");
        }

        return this._getQRCodeUrl().then((qrcodeUrl) => {
                var buttonTemplate = new LineMessageTemplateButton('QRコード');
                buttonTemplate.thumbnailImageUrl = qrcodeUrl;
                buttonTemplate.imageAspectRatio = 'square';
                buttonTemplate.title = this.config.messages.qrcode.title;
                buttonTemplate.text = this.config.messages.qrcode.text;
                buttonTemplate.addAction(new LineActionPostback('action=start', this.config.messages.qrcode.button));
                var templateMessage = new LineMessageTemplate('QRコード', buttonTemplate);
        
                return this.apiService.sendReply(replyToken, [templateMessage]);
        });
    }

    sendLastLocation(replyToken: string): Promise<any> {
        return this._getLastLocations().then((logs) => {
            if (logs.length == 0) {
                return this.replyMessage(replyToken, this.config.messages.noLocationLog);
            } else {
                // TODO: 複数割当
                var lastLog = logs[0];
                var timeElapse = this._getLogTimeExpression(moment(), moment(lastLog.timestamp));
                var mapImageUrl = lastLog.location.mapImageUrl;
                return this.apiService.sendReply(replyToken, [
                    new LineMessageImage(mapImageUrl, mapImageUrl),
                    new LineMessageText(`${timeElapse}に${lastLog.location.name}付近にいたようです。`)
                ]);
            }
        })
        .catch((err) => {
            if (err.name == 'UserBeaconNotFoundError') {
                return this.replyMessage(replyToken, 'バッジが登録されていません。');
            }
            throw err;
        });
    }

    sendMap(replyToken: string): Promise<any> {
        return this.replyMessage(replyToken, 'http://www.hoshigaoka-terrace.com/floor/index.php');
    }

    sendCurrentStampCard(replyToken: string): Promise<any> {
        var messages = [];
        return this._getUser().then((user: any) => {
            const cardConfig = this._stampCardConfig(user.cardId);
            console.log(user.stamps);
            const checkpoints = cardConfig.checkpoints;
            const stampsToString = (checkpointsCount: number, stamps: number[]) => {
                var str = '';
                for (var i = 1; i <= checkpointsCount; i++) {
                    if (stamps.indexOf(i) == -1) {
                        str += '0';
                    } else {
                        str += '1';
                    }
                }
                return str;
            }
            const imageMapMessage = new LineMessageImageMap(
                cardConfig.baseUrl + '/' + user.cardId + '/' + stampsToString(checkpoints.length, user.stamps),
                'スタンプカード'
            );
            
            // 全てのスタンプを制覇済みの場合
            if (user.stamps.length == cardConfig.checkpoints.length) {
                imageMapMessage.addAction({
                    type: 'message',
                    area: cardConfig.area,
                    text: cardConfig.completeMessage
                });
                messages.push(imageMapMessage)
                messages.push(new LineMessageText(this.config.messages.complete));
                if (! user.sendEnquete) {
                    messages.push(new LineMessageText(this.config.messages.requestEnquete));
                }
                
            // 未取得のスタンプがある場合
            } else {
                for (var i = 0; i < checkpoints.length; i++) {
                    if (this._hasStamp(user, checkpoints[i].locationId)) {
                        continue;
                    }

                    var location = this.config.locations.find((val) => {
                        return (val.id == checkpoints[i].locationId);
                    });
                    imageMapMessage.addAction({
                        type: 'message',
                        area: checkpoints[i].area,
                        text: location.keyword
                    });
                }
                messages.push(imageMapMessage);
                messages.push(new LineMessageText("数字を選んでヒントを見てみよう❕\nどこにいちご🍓が隠れているかわかるかな❓"));
                if (this._isDebug()) {
                    messages.push(new LineMessageText("DEBUG: 取得状況\n" + JSON.stringify(user.stamps)));
                }
            }
            return this.apiService.sendReply(replyToken, messages);
        });
    }

    requestEnquete() {
        return this._getUser()
            .then((user: any) => {
                user.sendEnquete = true;
                (new UserService()).update(user.userId, user);
            });
    }

    sendLocationHint(replyToken: string, messageText): Promise<any> {
        var location = this.config.locations.find((val, i) => {
            return (messageText.indexOf(val.keyword) != -1);
        });
        if (! location) {
            return this.replyMessage(replyToken, "数字を選んでヒントを見てみよう！");
        }

        var buttonTemplate = new LineMessageTemplateButton('ここはどこ？');
        buttonTemplate.thumbnailImageUrl = location.imageUrl;
        buttonTemplate.title = location.title;
        buttonTemplate.text = location.hint;
        buttonTemplate.addAction(new LineActionPostback('action=checkin&locationId=' + location.id, 'いちご🍓をつむ', '🍓はどこかな！？'));
        if (this._isDebug()) {
            buttonTemplate.addAction(new LineActionPostback('action=checkin&force=1&locationId=' + location.id, 'DEBUG:強制収穫'));
        }
        var templateMessage = new LineMessageTemplate(location.keyword, buttonTemplate);

        return this.apiService.sendReply(replyToken, [templateMessage]);
    }

    startStampRally(replyToken: string, params): Promise<any> {
        return (new RadarBeaconAttachmentService()).list({userId: this._userId(), attached: true})
            .then((res) => {
                if (res.Count == 0) {
                    return this.replyMessage(replyToken, "バッジが登録されていません。\n受付でバッジを受け取ってね。");
                }

                var userService = new UserService();
                var user = {
                    userId: this._userId(),
                    cardId: this.config.settings.cardId,
                    stamps: [],
                    updateAt: null
                }
                return userService.create(user)
                    .then(() => {
                        return this.apiService.setUserRichMenu(this._userId(), this.config.menus[this.stage].radar);
                    })
                    .then(() => {
                        // TODO: ありがとうメッセージ
                        return this.replyMessage(replyToken, "いちご狩りのマークからスタンプ台紙が確認できます。");
                    });
            });
    }

    checkinLocation(replyToken: string, params): Promise<any> {
        var locationId = +params.locationId;
        var location = this.config.locations.find((val, i) => {
            return (val.id == locationId);
        });

        var checkinUser = (user) => {
            user.stamps.push(locationId);
            return (new UserService()).update(user.userId, user)
        }
        return this._getUser()
            .then((user: any) => {
                var stampFilepath = this.config.stampCards[user.cardId].baseUrl + '/' + user.cardId + '/' + `stamp_${locationId}.png`;

                // Force checkin
                if (params.force) {
                    return checkinUser(user).then(() => {
						var messages = [
							new LineMessageImage(stampFilepath, stampFilepath),
							new LineMessageText(`DEBUG: ${locationId}番目のいちごをゲットしました\u2757`)
						];
						// 全て取得したときは、完了メッセージ
						if (user.stamps.length == this.config.stampCards[user.cardId].checkpoints.length) {
							messages.push(new LineMessageText(this.config.messages.complete));
							if (! user.sendEnquete) {
								messages.push(new LineMessageText(this.config.messages.requestEnquete));
							}
						}
						return this.apiService.sendReply(replyToken, messages);
                    });
                }

                return this._getLastLocations()
                    .then((logs) => {
                        var testCheckin = logs.findIndex((val, i) => {
                            if (val.receiverId != location.receiverId) {
                                console.log('MISMATCH LOCATION', `Location:${location.receiverId} LastLog:${val.receiverId}`);
                                return false;
                            }
                            if (moment().diff(moment(val.timestamp), 'minutes') > this.config.settings.checkinTimeThreshold) {
                                console.log('TIMEOUT', 'Log:' + val.timestamp);
                                return false;
                            }
                            return true;
                        });
                        return Promise.resolve(testCheckin != -1);
                    }).then((isCheckin) => {
                        if (this._hasStamp(user, locationId)) {
                            return this.replyMessage(replyToken, 'すでにいちごを収穫済みです。');
                        } else if (isCheckin) {
                            return checkinUser(user).then(() => {
								var messages = [
                                    new LineMessageImage(stampFilepath, stampFilepath),
                                    new LineMessageText(`${locationId}番目のいちごをゲットしました\u2757`)
								];
								// 全て取得したときは、完了メッセージ
								if (user.stamps.length == this.config.stampCards[user.cardId].checkpoints.length) {
									messages.push(new LineMessageText(this.config.messages.complete));
									if (! user.sendEnquete) {
										messages.push(new LineMessageText(this.config.messages.requestEnquete));
									}
								}
                                return this.apiService.sendReply(replyToken, messages);
                            });
                        } else {
                            return this.replyMessage(replyToken, '残念！いちごを見つけられませんでした。');
                        }
                    })
                    .catch((err) => {
                        if (err.name == 'UserBeaconNotFoundError') {
                            return this.replyMessage(replyToken, 'バッジが登録されていません。');
                        }
                        throw err;
                    });
            });
    }

    parsePostbackData(postbackData: string) {
        const queryString = require('querystring');
        return queryString.parse(postbackData);
    }

    private _isDebug(): boolean {
        return (process.env.DEBUG_MODE == '1') ? true : false;
    }

    private _hasStamp(user, locationId) {
        return (user.stamps.indexOf(locationId) != -1);
    }

    private _userId(): string {
        return this.source.userId;
    }

    private _stampCardConfig(cardId: number) {
        return this.config.stampCards[cardId];
    }

    private _currentLocation(beaconId: number): Promise<BeaconDetection|null> {
        return (new RadarService()).getDetections(beaconId, 1).then((res) => {
            if (res.Count == 0) {
                return Promise.resolve(null);
            } else {
                return Promise.resolve(res.Items[0]);
            }
        });
    }

    private _getUser(): Promise<User> {
        return (new UserService()).get(this._userId());
    }

    private _getLastLocations(): Promise<any[]> {
		return (new RadarBeaconAttachmentService()).list({userId: this._userId(), attached: true})
			.then((res) => {
				if (res.Count == 0) {
					return Promise.reject(new UserBeaconNotFoundError());
				}
				var beacons = [];
				res.Items.forEach((beacon) => {
                    beacons.push({beaconId: beacon.beaconId});
                });
				return Promise.resolve(beacons);
			})
			.then((beacons) => {
				var logs = [];
				var results = [];
				beacons.forEach((val, i) => {
					var beaconId = val.beaconId;
					results.push(this._currentLocation(beaconId).then((lastLog) => {
						if (lastLog) {
							logs.push(lastLog);
						}
					}));
				});
				return Promise.all(results).then(() => {
					return Promise.resolve(logs);
				});
			});
    }

    private _getQRCodeUrl(): Promise<string> {
        var userId = this._userId();
        var qrcodeService = new QRCodeService()
        return qrcodeService.find({userId: userId}).then((data) => {
            if (data) {
                return Promise.resolve(qrcodeService.getImageBaseUrl() + data.codeId);
            } else {
                return qrcodeService.createQrcode(this.source).then((codeId) => {
                    return Promise.resolve(qrcodeService.getImageBaseUrl() + codeId);
                });
            }
        });
    }

    private _getLogTimeExpression(timeNow, timeDiff): string {
        if (timeNow.diff(timeDiff, 'seconds') < 60) {
            return timeNow.diff(timeDiff, 'seconds') + '秒前';
        } else if (timeNow.diff(timeDiff, 'minutes') < 60) {
            return timeNow.diff(timeDiff, 'minutes') + '分前';
        } else if (timeNow.diff(timeDiff, 'hours') < 24) {
            return timeDiff.tz(process.env.TZ).format('H時m分頃');
        } else {
            return timeDiff.tz(process.env.TZ).format('M月D日のH時頃');
        }
    }
}

export class UserBeaconNotFoundError extends Error {
	name = 'UserBeaconNotFoundError';
}
