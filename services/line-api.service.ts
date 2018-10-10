const https = require('https');

export class LineApiService {
    channelAccessToken: string;
    private lineApiHostname = "api.line.me";

    sendReply(replyToken: string, messages: any[]) {
        return this._send(
            this._getRequestOptions("POST", "/v2/bot/message/reply"), JSON.stringify({
                replyToken: replyToken,
                messages: messages
            }));
    }

    getUserProfile(userId) {
        return this._send(
            this._getRequestOptions("GET", "/v2/bot/profile/" + userId));
    }

    getGroupMemberProfile(groupId, userId) {
        return this._send(
            this._getRequestOptions("GET", `/v2/bot/group/${groupId}/member/${userId}`));
    }

    getRichMenuList() {
        return this._send(
            this._getRequestOptions("GET", "/v2/bot/richmenu/list"));
    }

    createRichMenu(richMenu: LineRichMenu, imageData) {
        return this._send(
            this._getRequestOptions("GET", "/v2/bot/richmenu")).then((richMenuId) => {
                var headers = {
                    "Content-Type": "image/jpeg",
                    "Content-Length": "Content-Length"
                }
                return this._send(
                    this._getRequestOptions("POST", `/v2/bot/richmenu/${richMenuId}/content`, headers),
                    imageData);
            });
    }

    removeRichMenu(richMenuId: string) {
        return this._send(
            this._getRequestOptions("DELETE", `/v2/bot/richmenu/${richMenuId}`));
    }

    setUserRichMenu(userId: string, richMenuId: string) {
        return this._send(
            this._getRequestOptions("POST", `/v2/bot/user/${userId}/richmenu/${richMenuId}`));
    }

    unsetUserRichMenu(userId: string) {
        return this._send(
            this._getRequestOptions("DELETE", `/v2/bot/user/${userId}/richmenu/`));
    }

    private _getRequestHeader(headers?) {
        var requestHeaders = {
			"Content-Type": "application/json",
			"Authorization": "Bearer " + this.channelAccessToken
		};
        if (headers) {
            Object.assign(requestHeaders, headers);
        }
        return requestHeaders;
    }

    private _getRequestOptions(method: string, path: string, headers?) {
        return {
            hostname: this.lineApiHostname,
            port: 443,
            path: path,
            method: method,
            headers: this._getRequestHeader(headers)
        }
    }

    private _send(params, reqBody?) {
        console.log(reqBody);
        return new Promise((resolve, reject) => {
            if (process.env.offline) {
                return resolve(reqBody);
            }

            var req = https.request(params, (res) => {
                var data;
                res.on('data', (resBody) => {
                    data = resBody;
                });
                res.on('end', () => {
                    console.log('RESPONSE BODY', data);
                    resolve(data);
                });
            });
            req.on('error', (err) => {
                console.log('API ERROR', err);
                reject(err);
                return;
            });
            if (typeof reqBody != 'undefined') {
                req.end(reqBody);
            } else {
                req.end();
            }
        });
    }
}

interface LineObject {
    type: string
}

export class LineEvent implements LineObject {
    type: string
    timestamp: string
    source: {type: string, userId: string, groupId?: string, roomId: string}
    replyToken?: string
    message?: {}
    postback?: {data: string, params?: {}}
    beacon?: {hwid: string, type: string, dm?: string}
}

export class LineMessageText implements LineObject {
    type = 'text';

    constructor(
        public text: string
    ) {}

    valid() {
        if (typeof this.text != 'string') {
            return false;
        }
        if (this.text == '') {
            return false;
        }
        if (this.text.length > 2000) {
            return false;
        }
        return true;
    }
}

export class LineMessageSticker implements LineObject {
    type = 'sticker';

    constructor(
        public packageId: string,
        public stickerId: string
    ) {}
}

export class LineMessageImage implements LineObject {
    type = 'image';

    constructor(
        public originalContentUrl: string,  // Max size: 1024×1024, 1MB
        public previewImageUrl: string  // Max size: 240×240, 1MB
    ) {}
}

export class LineMessageImageMap implements LineObject {
    type = 'imagemap';
    baseSize = {width: 1040, height: 1040};
    actions = [];
    
    constructor(
        public baseUrl: string,  // 240,300,460,700,1040px幅の画像を入れておく
        public altText: string,
        height?: number
    ) {
        if (height != undefined) {
            this.baseSize.height = height;
        }
    }

    addAction(action: {type: string, area: LineActionArea, text?, linkUri?}) {
        this.actions.push(action);
    }
}

export class LineMessageTemplate implements LineObject {
    type = 'template';

    constructor(
        public altText: string,
        public template: LineMessageTemplateButton|LineMessageTemplateConfirm
    ) {}
}

export class LineMessageTemplateButton implements LineObject {
    type = 'buttons';
    thumbnailImageUrl?: string;
    imageAspectRatio?: string;
    imageSize?: string;
    imageBackgroundColor?: string;
    title?: string;
    defaultAction?: LineActionPostback|LineActionMessage|LineActionUri;
    actions = [];

    constructor(
        public text: string
    ) {}

    addAction(action: LineActionPostback|LineActionMessage|LineActionUri) {
        this.actions.push(action);
    }
}

export class LineMessageTemplateConfirm implements LineObject {
    type = 'confirm';
    actions = [];

    constructor(
        public text: string
    ) {}

    setAction(actions) {
        if (actions.length != 2) {
            throw new Error('確認テンプレートには2つのアクションを設定してください。');
        }
        this.actions = actions;
    }
}

export class LineActionPostback implements LineObject {
    type = 'postback';

    constructor(
        public data: string,
        public label?: string,
        public displayText?: string
    ) {}
}

export class LineActionMessage implements LineObject {
    type = 'message';

    constructor(
        public text: string,
        public label?: string
    ) {}
}

export class LineActionUri implements LineObject {
    type = 'uri';

    constructor(
        public uri: string,
        public label?: string
    ) {}
}

export class LineActionArea {
    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number
    ) {}
}

export class LineRichMenu {
    size = {width: 2500, height: 1686}
    areas = [];
    constructor(
        public selected: boolean,
        public name: string,
        public chatBarText: string,
    ) {}

    addArea(action: {bounds: LineActionArea, action: LineActionPostback|LineActionMessage|LineActionUri}) {
        this.areas.push(action);
    }
}