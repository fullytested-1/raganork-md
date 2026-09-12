'use strict';

const crypto = require('crypto');
const { loadBaileys } = require('./helpers');

class AIRich {
  constructor(client, options = {}) {
    if (!client || typeof client.relayMessage !== 'function') {
      throw new Error('A valid WhatsApp client is required');
    }
    this.client = client;
    this.dynamic = options.dynamic !== false;
    this.title = '';
    this.footer = '';
    this.sections = [];
    this.responseId = crypto.randomUUID();
    this.botResponseId = crypto.randomUUID();
  }

  setTitle(value) {
    this.title = String(value || '');
    return this;
  }

  setFooter(value) {
    this.footer = String(value || '');
    return this;
  }

  addSection(section) {
    if (!section || typeof section !== 'object') {
      throw new TypeError('Section must be an object');
    }
    this.sections.push(section);
    return this;
  }

  addHtml(html) {
    if (typeof html !== 'string' || !html.trim()) {
      throw new TypeError('HTML payload is required');
    }
    return this.addSection({
      view_model: {
        __typename: 'GenAISingleLayoutViewModel',
        primitive: {
          __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
          trusted_sources: [],
          payload: html
        }
      }
    });
  }

  build() {
    if (this.dynamic) {
      this.responseId = crypto.randomUUID();
      this.botResponseId = crypto.randomUUID();
    }

    const sections = this.footer
      ? [
          ...this.sections,
          {
            view_model: {
              __typename: 'GenAISingleLayoutViewModel',
              primitive: {
                __typename: 'GenAIMetadataTextPrimitive',
                text: this.footer
              }
            }
          }
        ]
      : this.sections;

    const data = Buffer.from(
      JSON.stringify({
        __typename: 'GenAIUnifiedResponse',
        response_id: this.responseId,
        sections
      }).replace(/[\\u007f-\\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
    ).toString('base64');

    return {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: this.title,
          botResponseId: this.botResponseId,
          verificationMetadata: {
            proofs: [
              {
                version: 1,
                useCase: 1,
                signature: crypto.randomBytes(64).toString('base64'),
                certificateChain: [
                  crypto.randomBytes(684).toString('base64'),
                  crypto.randomBytes(892).toString('base64')
                ]
              }
            ]
          }
        }
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [],
            unifiedResponse: { data },
            contextInfo: {}
          }
        }
      }
    };
  }

  async send(jid, options = {}) {
    const { generateWAMessageFromContent } = await loadBaileys();
    const message = generateWAMessageFromContent(jid, this.build(), {
      messageId: options.messageId || crypto.randomUUID().replace(/-/g, ''),
      ...options
    });

    await this.client.relayMessage(message.key.remoteJid, message.message, {
      messageId: message.key.id,
      additionalNodes: options.additionalNodes || []
    });

    return message;
  }
}

module.exports = { AIRich };
