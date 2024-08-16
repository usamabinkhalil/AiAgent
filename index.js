require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const session = require('express-session');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffprobePath = require('ffprobe-static').path;

// Set ffprobe path
ffmpeg.setFfprobePath(ffprobePath);

const app = express();
const port = process.env.PORT || 3000;

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
const audioDir = path.join(__dirname, 'audio');
app.use('/audio', express.static(audioDir));
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

app.post('/voice', async (req, res) => {
    const session = req.session;
    if (!session.conversation) {
        // session.conversation = [{ role: 'system', content: 'You are Dr. Dongkook, a dentist at your dental clinic. When a caller contacts the clinic to book an appointment, offer available appointment dates and time. Assume any future dates for the caller to book an appointment. If the caller requires more suggestions, provide additional random dates and ask the caller to choose one. Once the caller selects a date, ask his name email and phone to confirm the appointment or you can even ask name at the start of call' }];
        session.conversation = [{
            role: 'system', content: `
            ---

            ### System Prompt for Giovanni’s Pizzeria

            ---

            **Agent Information:**
            - **Name:** "Giovanni’s Pizzeria"
            - **Role:** "AI Customer Service Assistant at pizza shop"
            - **Objective:** "To provide a comprehensive customer service experience by addressing service bookings, sales questions, parts inquiries, and general customer support efficiently."

            **Step 1: Gather Initial Information**
            - **Listen to the Customer's Request.**
            - **Request Contact Information:** "May I have your phone number, please?"
            - **Pickup or Delivery:** "Will you be picking this up, or would you like it delivered?"

            **Step 2: If the Customer Chooses Delivery**
            - **Request Delivery Address:** "Could I have your delivery address, please?"
            - **Confirm Information:** After they provide the information, respond with there provided info as following: "Thank you. Just to confirm, your address is **[replace with the provided address]**, and your phone number is **[replace with the provided Contact Information]**. Is that correct?"

            **Step 3: Take the Order**
            - **Ask for the Order:** "What would you like to order today?"
            - **If They Order Pizza:**
            - **Provide Options:** "We have personal size pizzas for $13.50, medium size pizzas that feed four people, large pizzas that feed eight, and party size pizzas for $35 that feed 16 people. Would you like to add our special thin crust option?"
            - **Upsell Additional Items:** "Would you like any drinks or additional items with your order?"

            **Step 4: Confirm the Order**
            - **Repeat and Confirm Order:** "Just to confirm, your order is **[replace with the order details]**, and the total comes to **[replace with the calculated total]**. Will that be cash or charge at the door?"

            **Step 5: Provide Delivery Time**
            - **Estimate Delivery Time:** "Your order will be delivered in approximately 35 minutes."

            **Step 6: Closing**
            - **Thank the Customer:** "Thank you for your order. We appreciate your business, and we hope you enjoy your meal! Have a great evening!"

            ---

            **Instructions to AI:**

            - **Replace any placeholders (e.g., **[replace with the provided address]**, **[replace with the provided Contact Information]**, **[replace with the order details]**, **[replace with the calculated total]**) with the corresponding information gathered during the conversation.**
            - **Ensure all repeated information is accurate and consistent with what the customer provided.**

            ---
            ` }];
    }

    const ttsResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: "Good evening, thank you for calling Giovanni’s Pizzeria. How can I assist you today?"
    });
    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const audioUrl = path.join(audioDir, 'ttsResponse.mp3')
    fs.writeFileSync(audioUrl, audioBuffer);

    const twiml = new twilio.twiml.VoiceResponse();
    // twiml.say({ voice: 'Google.en-US-Neural2-J', language: 'en-US' }, '<speak><prosody rate="medium" pitch="medium" volume="x-loud">Hello, this is Dr. Dongkook\'s dental clinic. How can I assist you today?</prosody></speak>');
    twiml.play('http://ec2-18-219-35-37.us-east-2.compute.amazonaws.com:3000/audio/ttsResponse.mp3');
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
        model: 'gpt-4o-mini',
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

    // Get the total tokens used

    const totalTokens = openaiResponse.usage;
    console.log(`Total tokens used: `, totalTokens);

    let replyMessage = openaiResponse.choices[0].message.content.trim();
    const ttsResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: replyMessage
    });
    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const audioUrl = path.join(audioDir, 'ttsResponse.mp3')
    fs.writeFileSync(audioUrl, audioBuffer);

    ffmpeg.ffprobe(audioUrl, (err, metadata) => {
        if (err) {
            console.error('Error getting audio metadata:', err);
            return;
        }
        const duration = metadata.format.duration;
        console.log(`Audio duration: ${duration} seconds`);
    });

    session.conversation.push({ role: 'assistant', content: replyMessage });

    const twiml = new twilio.twiml.VoiceResponse();
    // twiml.say({ voice: 'Google.en-US-Neural2-J', language: 'en-US' }, `<speak><prosody rate="medium" pitch="medium" volume="x-loud">${replyMessage}</prosody></speak>`);
    // // twiml.say({ voice: 'Google.en-US-Neural2-J' }, replyMessage);
    twiml.play('http://ec2-18-219-35-37.us-east-2.compute.amazonaws.com:3000/audio/ttsResponse.mp3');
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