export type Locale = 'en' | 'uz';
export type AudioLanguage = 'auto' | 'en' | 'uz';

const messages = {
	en: {
		welcome: '👋 Hi! I turn voice notes into text.\n\nChoose your reply language below. / Tilni tanlang.',
		chooseLanguage: '🌍 Which language should I use for replies?',
		chooseAudio: '🎙 What language are your recordings in?\n\nChoose Automatic for mixed languages or if you’re unsure. Your words will be written in their original language, not translated.',
		ready: '✅ You’re all set!\n\n1. Send or forward a voice note or audio file.\n2. I’ll turn it into text and reply here.\n\nUp to 10 minutes and 20 MB per recording.\n/language — change reply language\n/audio_language — change recording language\n/privacy — how your recordings are handled',
		audioSaved: '✅ Recording language saved. Send or forward a voice note whenever you’re ready!',
		received: '🎧 Got it! I’m turning your recording into text. I’ll reply here when it’s ready.',
		unsupported: '🎙 Send or forward a voice note or audio file, and I’ll turn it into text. Use /language to change your language.',
		tooLarge: 'That recording is a little too large. Please send one under 20 MB and up to 10 minutes long.',
		tooLong: 'That recording is too long. Please send one up to 10 minutes long.',
		unavailable: 'I couldn’t open that recording. Please send it again, keeping it under 20 MB.',
		empty: 'That recording seems to be empty. Please try sending another one.',
		noSpeech: 'I couldn’t hear any speech in that recording. Please try again with a clearer recording.',
		dailyLimit: 'Today’s transcription allowance has been used up. Please come back after 00:00 UTC. Thanks for your patience! 💛',
		busy: 'I’m receiving a lot of recordings right now. Please wait a minute and try again. 💛',
		processingError: 'Sorry, something went wrong while processing your recording. Please try again a little later.',
		privacy: '🔒 Your recording is used only to turn speech into text. This service doesn’t save the audio. Temporary text is deleted after delivery or after about one day. Your language choice is remembered for next time. Telegram keeps messages according to its own policies.',
	},
	uz: {
		welcome: '👋 Salom! Men ovozli xabarlarni matnga aylantiraman.\n\nJavoblar tilini tanlang. / Choose your language.',
		chooseLanguage: '🌍 Qaysi tilda javob berishimni xohlaysiz?',
		chooseAudio: '🎙 Ovozli xabarlaringiz qaysi tilda?\n\nAralash tillar uchun yoki ishonchingiz komil bo‘lmasa, “Avtomatik”ni tanlang. Matn asl tilda yoziladi, tarjima qilinmaydi.',
		ready: '✅ Hammasi tayyor!\n\n1. Ovozli xabar yoki audiofayl yuboring yoki boshqalardan yo‘naltiring.\n2. Men uni matnga aylantirib, shu yerga yuboraman.\n\nHar bir yozuv 10 daqiqagacha va 20 MB gacha bo‘lsin.\n/language — javoblar tilini o‘zgartirish\n/audio_language — yozuv tilini o‘zgartirish\n/privacy — yozuvlaringiz qanday ishlatilishi',
		audioSaved: '✅ Yozuv tili saqlandi. Tayyor bo‘lsangiz, ovozli xabar yuboring yoki yo‘naltiring!',
		received: '🎧 Qabul qildim! Yozuvingizni matnga aylantiryapman. Tayyor bo‘lgach, shu yerga yuboraman.',
		unsupported: '🎙 Ovozli xabar yoki audiofayl yuboring — men uni matnga aylantiraman. Tilni o‘zgartirish uchun /language buyrug‘idan foydalaning.',
		tooLarge: 'Yozuv hajmi biroz katta. Iltimos, 20 MB dan kichik va 10 daqiqagacha bo‘lgan yozuv yuboring.',
		tooLong: 'Yozuv juda uzun. Iltimos, 10 daqiqagacha bo‘lgan yozuv yuboring.',
		unavailable: 'Bu yozuvni ochib bo‘lmadi. Iltimos, uni qayta yuboring. Hajmi 20 MB dan kichik bo‘lsin.',
		empty: 'Yozuv bo‘shga o‘xshaydi. Iltimos, boshqa yozuv yuboring.',
		noSpeech: 'Yozuvda nutqni aniqlay olmadim. Iltimos, aniqroq ovoz bilan qayta urinib ko‘ring.',
		dailyLimit: 'Bugungi matnga aylantirish limiti tugadi. Iltimos, UTC vaqti bilan 00:00 dan keyin qayting. Sabringiz uchun rahmat! 💛',
		busy: 'Hozir juda ko‘p yozuv kelmoqda. Iltimos, bir daqiqa kutib, qayta urinib ko‘ring. 💛',
		processingError: 'Kechirasiz, yozuvingizni qayta ishlashda xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko‘ring.',
		privacy: '🔒 Yozuvingiz faqat nutqni matnga aylantirish uchun ishlatiladi. Bu xizmat audioyozuvni saqlamaydi. Vaqtinchalik matn yuborilgach yoki taxminan bir kundan keyin o‘chiriladi. Til tanlovingiz keyingi safar uchun saqlanadi. Telegram xabarlarni o‘z qoidalariga muvofiq saqlaydi.',
	},
};

export type MessageKey = keyof typeof messages.en;
export function text(locale: Locale | undefined, key: MessageKey): string {
	return messages[locale ?? 'en'][key];
}
