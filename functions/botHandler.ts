'use strict';

import { config } from '../config';
import { LineBotService } from '../services/line-bot.service';

export function botHandler(event, context, callback):void {
    console.log('Received event:', JSON.stringify(event, null, 2));

	const stage = (process.env.offline) ? 'alpha' : event.stageVariables.stage;
	var botService = new LineBotService(config, stage);
	var reqBody = (event.body) ? JSON.parse(event.body) : null;
    var results = [];
    reqBody.events.forEach((webhook) => {
        botService.setSource(webhook.source);
        switch (webhook.type) {
            case 'message':
                var replyToken = webhook.replyToken;
                var message = webhook.message;
                if (message.type == 'text') {
                    var action = botService.findKeywordAction(message.text);
                    if (action) {
                        results.push(botService[action](replyToken, message.text));
                    } else if (botService.isPrivateTalk()) {
                        results.push(botService.replyMessage(replyToken, config.messages.default));
                    }
                } else if (botService.isPrivateTalk()) {
                    results.push(botService.replyMessage(replyToken, config.messages.default));
                }
                break;
            case 'follow':
                var replyToken = webhook.replyToken;
                 results.push(botService.follow(replyToken));
                break;
            case 'join':
                results.push(botService.join(replyToken));
                break;
            case 'postback':
                var replyToken = webhook.replyToken;
                var postbackData = botService.parsePostbackData(webhook.postback.data);
                var action = botService.findPostbackAction(postbackData.action);
                if (action) {
                    results.push(botService[action](replyToken, postbackData));
                }
                break;
            case 'beacon':
                
        }
    });

    Promise.all(results).then(() => {
        callback(null, {
            statusCode: 200,
            body: 'success',
            headers: {'Content-Type': 'application/text'}
        });
    }).catch((err) => {
        console.log('ERROR', err);
        callback(null, {
            statusCode: 200 // LINE bot MUST return 200 status to webhook
        });
    });
}