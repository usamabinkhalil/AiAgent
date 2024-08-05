require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const session = require('express-session');
const OpenAI = require('openai');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.use('/audio', express.static(path.join(__dirname, 'audio')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
}));

app.get('/test', (req, res) => {
    // twilioClient.incomingPhoneNumbers.get({ phoneNumber: '+12562897247' })
    //     .then(numbers => {
    //         if (numbers.length > 0) {
    //             console.log(numbers);
    //             // const incomingPhoneNumber = numbers[0];
    //             // return twilioClient.incomingPhoneNumbers(incomingPhoneNumber.sid)
    //             //     .update({ voiceUrl: newVoiceUrl });
    //         } else {
    //             throw new Error('Phone number not found');
    //         }
    //     })
    //     .then(updatedNumber => {
    //         console.log(`Updated voice URL for ${updatedNumber}`);
    //     })
    //     .catch(error => {
    //         console.error('Error updating voice URL:', error);
    //     });
    res.send('App is running');

});

app.post('/voice', (req, res) => {
    const session = req.session;
    if (!session.conversation) {
        // session.conversation = [{ role: 'system', content: 'You are Dr. Dongkook, a dentist at your dental clinic. When a caller contacts the clinic to book an appointment, offer available appointment dates and time. Assume any future dates for the caller to book an appointment. If the caller requires more suggestions, provide additional random dates and ask the caller to choose one. Once the caller selects a date, ask his name email and phone to confirm the appointment or you can even ask name at the start of call' }];
        session.conversation = [{ role: 'system', content: 'You are Dr. Dongkook, a dentist at your dental clinic and you will respoce in Contextual Responses SSML for twilio. When a caller contacts the clinic to book an appointment, offer available appointment dates and time. Assume any future dates for the caller to book an appointment. If the caller requires more suggestions, provide additional random dates and ask the caller to choose one. Once the caller selects a date, ask his name email and phone to confirm the appointment or you can even ask name at the start of call' }];
    }

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'Google.en-US-Neural2-J', language: 'en-US' }, '<speak><prosody rate="medium" pitch="medium" volume="x-loud">Hello, this is Dr. Dongkook\'s dental clinic. How can I assist you today?</prosody></speak>');
    twiml.gather({
        input: 'speech',
        action: '/voice-response',
        method: 'POST',
        speechTimeout: "auto",
    });
    res.type('text/xml');
    res.send(twiml.toString());
});

app.post('/voice-response', async (req, res) => {
    const { SpeechResult: userMessage } = req.body;
    const session = req.session;


    const openaiResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            ...session.conversation,
            { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 150,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    });

    let replyMessage = openaiResponse.choices[0].message.content.trim();
    console.log(replyMessage);
    // const ttsResponse = await openai.audio.speech.create({
    //     model: "tts-1",
    //     voice: "alloy",
    //     input: replyMessage
    // });
    // const audioData = ttsResponse.data.audio;
    // const audioBuffer = Buffer.from(audioData, 'base64');
    // fs.writeFileSync('ttsResponse.wav', audioBuffer);

    session.conversation.push({ role: 'assistant', content: replyMessage });

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'Google.en-US-Neural2-J', language: 'en-US' }, `<speak><prosody rate="medium" pitch="medium" volume="x-loud">${replyMessage}</prosody></speak>`);
    // twiml.say({ voice: 'Google.en-US-Neural2-J' }, replyMessage);
    twiml.gather({
        input: 'speech',
        action: '/voice-response',
        method: 'POST',
        speechTimeout: "auto",
    });
    res.type('text/xml');
    res.send(twiml.toString());
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});