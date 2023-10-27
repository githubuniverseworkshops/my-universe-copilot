// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const OpenAI = require('openai');
const { ActivityHandler, MessageFactory } = require('botbuilder');
const { ActionTypes } = require('botframework-schema');

class TextSummarizerBot extends ActivityHandler {
    constructor() {
        super();

        this.onMembersAdded(async (context, next) => {
            await this.sendWelcomeMessage(context);

            await next();
        });

        let owner;
        let repoName;
        const baseUrlGithubApi = 'https://api.github.com';

        this.onMessage(async (context, next) => {
            const text = context.activity.text;

            if (text.includes('/')) {
                // Split user text by slash to get owner and repo name
                const repo = text.split('/');
                owner = repo[0].trim();
                repoName = repo[1].trim();

                // Fetch the list of repository markdown files in the repository root
                const repoFiles = await fetch(`${ baseUrlGithubApi }/repos/${ owner }/${ repoName }/contents/`);
                const repoFilesJson = await repoFiles.json();

                // Filter the list of files to only include markdown files
                const markdownFiles = repoFilesJson.filter(file => file.name.endsWith('.md'));

                // Create an array with all the file names
                const fileNames = markdownFiles.map(file => file.name);

                await context.sendActivity(`Found ${ markdownFiles.length } markdown file(s) in the repository; ${ baseUrlGithubApi }/${ owner }/${ repoName }`);

                await this.sendSuggestedActions(context, fileNames);
            } else {
                // If text contains .md extension. This message is sent to the bot automatically depending on which card the user clicks on.
                if (text.endsWith('.md')) {
                    await context.sendActivity(`Fetching data for:\n\n- File name: ${ text }\n\n- Repo owner: ${ owner }\n\n- Repo name: ${ repoName }`);

                    // Fetch the file contents
                    const fileContents = await fetch(`https://raw.githubusercontent.com/${ owner }/${ repoName }/main/${ text }`);
                    const fileContentsText = await fileContents.text();

                    const openai = new OpenAI({
                        apiKey: process.env.OpenApiKey
                    });

                    const summaryRequirements = `
                        The following is a text file written in GitHub flavored Markdown. Please write a short summary with the following requirements:

                        - The summary should be no more than 4 sentences
                        - The summary should focus on the most important and impactful information from the post
                        - The summary should be concise and written for a technical audience
                        - The summary should not include emojis
                        - The summary should focus on what the text is about, and not about the file itself
                        - The summary should be formatted in plain text with line break as appropriate
                    `;

                    const completion = await openai.chat.completions.create({
                        model: 'gpt-3.5-turbo',
                        messages: [{ role: 'user', content: `${ summaryRequirements }\n\n${ fileContentsText }` }]
                    });

                    await context.sendActivity(`${ completion.choices[0].message.content }`);
                }
            }

            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }

    /**
     * Send a welcome message along with suggested actions for the user to click.
     * @param {TurnContext} turnContext A TurnContext instance containing all the data needed for processing this conversation turn.
     */
    async sendWelcomeMessage(turnContext) {
        const { activity } = turnContext;

        // Iterate over all new members added to the conversation.
        for (const idx in activity.membersAdded) {
            if (activity.membersAdded[idx].id !== activity.recipient.id) {
                const welcomeMessage = 'Welcome!' +
                    'This bot helps you create summaries of repository markdown files such as READMEs.\n\n' +
                    'Please reply with a public repository in the format owner/repository, e.g. "github/docs" to proceed.';
                await turnContext.sendActivity(welcomeMessage);
            }
        }
    }

    /**
     * Send suggested actions to the user.
     * @param {TurnContext} turnContext A TurnContext instance containing all the data needed for processing this conversation turn.
     */
    async sendSuggestedActions(turnContext, fileNames) {
        // Create a card action for each file name
        const cardActions = fileNames.map(fileName => {
            return {
                type: ActionTypes.PostBack,
                title: fileName,
                value: fileName
            };
        });

        var reply = MessageFactory.suggestedActions(cardActions, 'Which file do you wish to summarize?');

        await turnContext.sendActivity(reply);
    }
}

module.exports.TextSummarizerBot = TextSummarizerBot;
