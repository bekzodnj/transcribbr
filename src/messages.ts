export type Locale = 'en' | 'uz';
export type AudioLanguage = 'auto' | 'en' | 'uz';

const messages = {
	en: {
		welcome: '👋 Hi! I turn voice notes into text.\n\nChoose the menu language below. / Bot menyusi tilini tanlang.',
		chooseLanguage: '🌍 Choose the menu language. This changes buttons and bot messages, not your audio language or transcript.',
		uiSaved: '✅ Menu language saved. Your audio language has not changed. Send a voice note, or use /audio_lang to choose its language.',
		settings: '⚙️ Language settings\n\n🌍 Menu language — buttons and bot messages.\n🎙 Audio language — the speech in your audio.\n\nThese are independent. Transcripts stay in the original language; translation is not enabled.',
		menuUi: '🌍 Menu language',
		menuInput: '🎙 Audio language',
		menuBack: '⬅️ Settings',
		chooseAudio: '🎙 What language are your recordings in?\n\nChoose Automatic for mixed languages or if you’re unsure. Your words will be written in their original language, not translated.',
		ready: '✅ You’re all set!\n\n1. Send or forward a voice note or audio file.\n2. I’ll turn it into text and reply here.\n\nUp to 10 minutes and 20 MB per recording.\n/menu_lang — menu and bot message language\n/audio_lang — audio language\n/settings — open language controls\n/privacy — how your recordings are handled',
		audioSaved: '✅ Recording language saved. Send or forward a voice note whenever you’re ready!',
		received: '🎧 Got your recording! Turning it into text now.',
		unsupported: '🎙 Send or forward a voice note or audio file, and I’ll turn it into text. Use /menu_lang for menus and bot messages or /audio_lang for the audio language.',
		tooLarge: 'That recording is a little too large. Please send one under 20 MB and up to 10 minutes long.',
		tooLong: 'That recording is too long. Please send one up to 10 minutes long.',
		unavailable: 'I couldn’t open that recording. Please send it again, keeping it under 20 MB.',
		empty: 'That recording seems to be empty. Please try sending another one.',
		noSpeech: 'I couldn’t hear any speech in that recording. Please try again with a clearer recording.\n\nCheck or change the audio language: /audio_lang\nThen send the recording again.',
		dailyLimit: 'Today’s transcription allowance has been used up. Please come back after 00:00 UTC. Thanks for your patience! 💛',
		busy: 'I’m receiving a lot of recordings right now. Please wait a minute and try again. 💛',
		processingError: 'Sorry, something went wrong while processing your recording. Please try again a little later.',
		privacy: '🔒 Your recording is used only to turn speech into text. This service doesn’t save the audio. Temporary text is deleted after delivery or after about one day. Your language choice is remembered for next time. Telegram keeps messages according to its own policies.',
	},
	uz: {
		welcome: '👋 Salom! Men ovozli xabarlarni matnga aylantiraman.\n\nBot menyusi tilini tanlang. / Choose the menu language.',
		chooseLanguage: '🌍 Bot menyusi tilini tanlang. Bu tugmalar va bot xabarlari tilini özgartiradi, yozuv yoki matn tilini emas.',
		uiSaved: '✅ Bot menyusi tili saqlandi. Yozuv tili özgarmadi. Ovozli xabar yuboring yoki uning tilini /audio_lang orqali tanlang.',
		settings: '⚙️ Til sozlamalari\n\n🌍 Menyu tili — tugmalar va bot xabarlari.\n🎙 Yozuv tili — audioyozuvdagi nutq tili.\n\nBu sozlamalar bir-biridan mustaqil. Matn asl tilda yoziladi, tarjima qilinmaydi.',
		menuUi: '🌍 Menyu tili',
		menuInput: '🎙 Yozuv tili',
		menuBack: '⬅️ Sozlamalar',
		chooseAudio: '🎙 Ovozli xabarlaringiz qaysi tilda?\n\nAralash tillar uchun yoki ishonchingiz komil bölmasa, “Avtomatik”ni tanlang. Matn asl tilda yoziladi, tarjima qilinmaydi.',
		ready: '✅ Hammasi tayyor!\n\n1. Ovozli xabar yoki audiofayl yuboring yoki boshqalardan yönaltiring.\n2. Men uni matnga aylantirib, shu yerga yuboraman.\n\nHar bir yozuv 10 daqiqagacha va 20 MB gacha bölsin.\n/menu_lang — bot menyusi va xabarlari tili\n/audio_lang — yozuv tili\n/settings — til sozlamalari\n/privacy — yozuvlaringiz qanday ishlatilishi',
		audioSaved: '✅ Yozuv tili saqlandi. Tayyor bölsangiz, ovozli xabar yuboring yoki yönaltiring!',
		received: '🎧 Xabar qabul qilindi, hozir matnga aylantiryapman.',
		unsupported: '🎙 Ovozli xabar yoki audiofayl yuboring — men uni matnga aylantiraman. Bot menyusi va xabarlari tili: /menu_lang. Yozuv tili: /audio_lang.',
		tooLarge: 'Yozuv hajmi biroz katta. Iltimos, 20 MB dan kichik va 10 daqiqagacha bölgan yozuv yuboring.',
		tooLong: 'Yozuv juda uzun. Iltimos, 10 daqiqagacha bölgan yozuv yuboring.',
		unavailable: 'Bu yozuvni ochib bölmadi. Iltimos, uni qayta yuboring. Hajmi 20 MB dan kichik bölsin.',
		empty: 'Yozuv böshga öxshaydi. Iltimos, boshqa yozuv yuboring.',
		noSpeech: 'Yozuvda nutqni aniqlay olmadim. Iltimos, aniqroq ovoz bilan qayta urinib köring.\n\nYozuv tilini tekshirish yoki özgartirish: /audio_lang\nSöng yozuvni qayta yuboring.',
		dailyLimit: 'Bugungi matnga aylantirish limiti tugadi. Iltimos, UTC vaqti bilan 00:00 dan keyin qayting. Sabringiz uchun rahmat! 💛',
		busy: 'Hozir juda köp yozuv kelmoqda. Iltimos, bir daqiqa kutib, qayta urinib köring. 💛',
		processingError: 'Kechirasiz, yozuvingizni qayta ishlashda xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib köring.',
		privacy: '🔒 Yozuvingiz faqat nutqni matnga aylantirish uchun ishlatiladi. Bu xizmat audioyozuvni saqlamaydi. Vaqtinchalik matn yuborilgach yoki taxminan bir kundan keyin öchiriladi. Til tanlovingiz keyingi safar uchun saqlanadi. Telegram xabarlarni öz qoidalariga muvofiq saqlaydi.',
	},
};

export type MessageKey = keyof typeof messages.en;
export function text(locale: Locale | undefined, key: MessageKey): string {
	return messages[locale ?? 'en'][key];
}
