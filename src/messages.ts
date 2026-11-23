export type Locale = 'en' | 'uz' | 'ru';
export type AudioLanguage = 'auto' | 'en' | 'uz' | 'ru';
export const LOCALES: readonly Locale[] = ['en', 'uz', 'ru'];

const messages = {
	en: {
		welcome: '👋 Hi! I turn voice notes into text.\n\nChoose the menu language below. / Bot menyusi tilini tanlang. / Выберите язык меню.',
		chooseLanguage: '🌍 Choose the menu and translation language. This changes only the menu language and text translation—not your audio language.',
		uiSaved: '✅ Saved. Send a voice message.',
		settings: '⚙️ Language settings\n\n🌍 Menu and translation language — buttons, bot messages, and translation target.\n🎙 Voice message language — the speech in your audio.',
		languageStatus: '🎙 Audio: {audio}   ·   🌍 Translate to: {target}',
		menuUi: '🌍 Menu & translation language',
		menuInput: '🎙 Voice message language',
		menuUsage: '📊 Usage',
		menuBack: '⬅️ Settings',
		chooseAudio: '🎙 What language are your recordings in?\n\nChoose Automatic for mixed languages or if you’re unsure. Your words will be written in their original language, not translated.',
		ready: '✅ You’re all set!\n\n1. Send or forward a voice note or audio file.\n2. I’ll turn it into text and reply here.\n\nUp to 10 minutes and 20 MB per recording.\n/menu_lang — menu and bot message language\n/audio_lang — audio language\n/settings — open language controls\n/privacy — how your recordings are handled',
		audioSaved: '✅ Recording language saved. Send or forward a voice note whenever you’re ready!',
		received: '🎧 Got your recording! Turning it into text now.',
		translateButton: '🌐 Translate',
		translating: '🌐 Translating…',
		translatingButton: '⏳ Translating…',
		translationUnavailable: 'This transcript is no longer available. Please send the recording again.',
		translationError: 'Sorry, I couldn’t translate this message. Please try again later.',
		monthlyLimit: 'You’ve reached this month’s free limit. It resets on the 1st of next month (UTC).',
		usageTitle: '📊 Your usage this month',
		usageAudio: '🎙 Audio: {used} / {limit} min',
		usageTranscriptions: '📝 Transcriptions: {used} / {limit}',
		usageTranslations: '🌐 Translations: {used} / {limit}',
		usageReset: 'Limits reset on the 1st of next month (UTC).',
		usageAdmin: '♾️ You are a super admin user.',
		translationNotice: '🌍 Translated to: {target}  ·  Change it in /menu_lang',
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
		welcome: '👋 Salom! Men ovozli xabarlarni matnga aylantiraman.\n👋 Hi! I turn voice notes into text.\n\nBot menyusi tilini tanlang. / Choose the menu language. / Выберите язык меню.',
		chooseLanguage: '🌍 Menyu va tarjima tilini tanlang. Bu faqat menyu tili va matn tarjimasini özgartiradi — ovoz xabar tilini emas.',
		uiSaved: '✅ Saqlandi, ovoz xabar yuboring.',
		settings: '⚙️ Til sozlamalari\n\n🌍 Menyu va tarjima tili — tugmalar, bot xabarlari va tarjima tili.\n🎙 Ovoz xabar tili — audioyozuvdagi nutq tili.',
		languageStatus: '🎙 Yozuv tili: {audio}   ·   🌍 Tarjima tili: {target}',
		menuUi: '🌍 Menyu va tarjima tili',
		menuInput: '🎙 Ovoz xabar tili',
		menuUsage: '📊 Statistika',
		menuBack: '⬅️ Sozlamalar',
		chooseAudio: '🎙 Ovozli xabarlaringiz qaysi tilda?\n\nAralash tillar uchun yoki ishonchingiz komil bölmasa, “Avtomatik”ni tanlang. Matn asl tilda yoziladi, tarjima qilinmaydi.',
		ready: '✅ Hammasi tayyor!\n\n1. Ovozli xabar yoki audiofayl yuboring yoki boshqalardan yönaltiring.\n2. Men uni matnga aylantirib, shu yerga yuboraman.\n\nHar bir yozuv 10 daqiqagacha va 20 MB gacha bölsin.\n/menu_lang — menyu va bot xabarlari tili\n/audio_lang — yozuv tili\n/settings — til sozlamalari\n/privacy — yozuvlaringiz qanday ishlatilishi',
		audioSaved: '✅ Yozuv tili saqlandi. Tayyor bölsangiz, ovozli xabar yuboring yoki yönaltiring!',
		received: '🎧 Xabar qabul qilindi, hozir matnga aylantiryapman.',
		translateButton: '🌐 Tarjima qilish',
		translating: '🌐 Tarjima qilinyapti…',
		translatingButton: '⏳ Tarjima qilinyapti…',
		translationUnavailable: 'Bu matnni ochib bölmadi. Iltimos, yozuvni qayta yuboring.',
		translationError: 'Kechirasiz, bu matnni tarjima qilib bölmadi. Keyinroq qayta urinib köring.',
		monthlyLimit: 'Bu oy uchun bepul limit tugadi. U keyingi oyning 1-kuni (UTC) yangilanadi.',
		usageTitle: '📊 Bu oydagi foydalanishingiz',
		usageAudio: '🎙 Audio: {used} / {limit} daq.',
		usageTranscriptions: '📝 Matnga aylantirish: {used} / {limit}',
		usageTranslations: '🌐 Tarjimalar: {used} / {limit}',
		usageReset: 'Limitlar keyingi oyning 1-kuni (UTC) yangilanadi.',
		usageAdmin: '♾️ Siz super admin foydalanuvchisiz.',
		translationNotice: '🌍 Tarjima qilindi: {target}  ·  /menu_lang orqali özgartiring',
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
	ru: {
		welcome: '👋 Привет! Я превращаю голосовые сообщения в текст.\n👋 Hi! I turn voice notes into text.\n\nВыберите язык меню. / Choose the menu language. / Bot menyusi tilini tanlang.',
		chooseLanguage: '🌍 Выберите язык меню и перевода. Он меняет только язык меню и перевод текста — не язык аудио.',
		uiSaved: '✅ Сохранено. Отправьте голосовое сообщение.',
		settings: '⚙️ Языковые настройки\n\n🌍 Язык меню и перевода — кнопки, сообщения бота и язык перевода.\n🎙 Язык голосовых сообщений — речь в вашей записи.',
		languageStatus: '🎙 Аудио: {audio}   ·   🌍 Перевод на: {target}',
		menuUi: '🌍 Язык меню и перевода',
		menuInput: '🎙 Язык голосовых сообщений',
		menuUsage: '📊 Статистика',
		menuBack: '⬅️ Настройки',
		chooseAudio: '🎙 На каком языке ваши записи?\n\nВыберите «Авто» для смешанных языков или если не уверены. Слова будут записаны на исходном языке, без перевода.',
		ready: '✅ Всё готово!\n\n1. Отправьте или перешлите голосовое сообщение либо аудиофайл.\n2. Я превращу его в текст и отвечу здесь.\n\nДо 10 минут и 20 МБ на запись.\n/menu_lang — язык меню и сообщений бота\n/audio_lang — язык аудио\n/settings — языковые настройки\n/privacy — как обрабатываются записи',
		audioSaved: '✅ Язык записи сохранён. Отправьте голосовое сообщение, когда будете готовы!',
		received: '🎧 Запись получена, сейчас превращаю её в текст.',
		translateButton: '🌐 Перевести',
		translating: '🌐 Перевожу…',
		translatingButton: '⏳ Перевожу…',
		translationUnavailable: 'Этот текст больше недоступен. Пожалуйста, отправьте запись ещё раз.',
		translationError: 'Извините, не удалось перевести это сообщение. Попробуйте позже.',
		monthlyLimit: 'Лимит на этот месяц исчерпан. Он обновится 1-го числа следующего месяца (UTC).',
		usageTitle: '📊 Ваше использование в этом месяце',
		usageAudio: '🎙 Аудио: {used} / {limit} мин',
		usageTranscriptions: '📝 Расшифровки: {used} / {limit}',
		usageTranslations: '🌐 Переводы: {used} / {limit}',
		usageReset: 'Лимиты обновятся 1-го числа следующего месяца (UTC).',
		usageAdmin: '♾️ Вы супер-администратор.',
		translationNotice: '🌍 Переведено на: {target}  ·  Изменить в /menu_lang',
		unsupported: '🎙 Отправьте или перешлите голосовое сообщение либо аудиофайл, и я превращу его в текст. Язык меню: /menu_lang. Язык аудио: /audio_lang.',
		tooLarge: 'Запись немного слишком большая. Пожалуйста, отправьте файл до 20 МБ и до 10 минут.',
		tooLong: 'Запись слишком длинная. Пожалуйста, отправьте запись до 10 минут.',
		unavailable: 'Не удалось открыть эту запись. Пожалуйста, отправьте её снова, размером до 20 МБ.',
		empty: 'Похоже, запись пустая. Попробуйте отправить другую.',
		noSpeech: 'Не удалось распознать речь в записи. Попробуйте ещё раз с более чётким звуком.\n\nПроверьте или измените язык аудио: /audio_lang\nЗатем отправьте запись снова.',
		dailyLimit: 'Дневной лимит на расшифровку исчерпан. Пожалуйста, вернитесь после 00:00 UTC. Спасибо за терпение! 💛',
		busy: 'Сейчас очень много записей. Подождите минуту и попробуйте снова. 💛',
		processingError: 'Извините, при обработке записи произошла ошибка. Попробуйте немного позже.',
		privacy: '🔒 Запись используется только для превращения речи в текст. Сервис не сохраняет аудио. Временный текст удаляется после доставки или примерно через сутки. Выбранный язык запоминается на следующий раз. Telegram хранит сообщения по своим правилам.',
	},
};

export type MessageKey = keyof typeof messages.en;
export function text(locale: Locale | undefined, key: MessageKey): string {
	return messages[locale ?? 'en'][key];
}

const audioNames: Record<Locale, Record<AudioLanguage, string>> = {
	en: { auto: '🌐 Automatic', en: '🎙 English', uz: '🎙 Uzbek', ru: '🎙 Russian' },
	uz: { auto: '🌐 Avtomatik', en: '🎙 Inglizcha', uz: '🎙 Özbekcha', ru: '🎙 Ruscha' },
	ru: { auto: '🌐 Авто', en: '🎙 Английский', uz: '🎙 Узбекский', ru: '🎙 Русский' },
};
const targetNames: Record<Locale, string> = {
	en: '🇬🇧 English',
	uz: '🇺🇿 Özbekcha',
	ru: '🇷🇺 Русский',
};

// Shows the current recording language and translation target for quick checks.
export function languageStatus(locale: Locale, audioLanguage: AudioLanguage): string {
	return text(locale, 'languageStatus')
		.replace('{audio}', audioNames[locale][audioLanguage])
		.replace('{target}', targetNames[locale]);
}

export function translationNotice(locale: Locale): string {
	return text(locale, 'translationNotice').replace('{target}', targetNames[locale]);
}

export interface UsageSnapshot {
	audioSeconds: number;
	transcriptions: number;
	translations: number;
}

export function usageText(locale: Locale, used: UsageSnapshot, limits: {
	seconds: number; transcriptions: number; translations: number;
}, admin = false): string {
	return [
		text(locale, 'usageTitle'),
		'',
		text(locale, 'usageAudio')
			.replace('{used}', String(Math.ceil(used.audioSeconds / 60)))
			.replace('{limit}', String(Math.floor(limits.seconds / 60))),
		text(locale, 'usageTranscriptions')
			.replace('{used}', String(used.transcriptions)).replace('{limit}', String(limits.transcriptions)),
		text(locale, 'usageTranslations')
			.replace('{used}', String(used.translations)).replace('{limit}', String(limits.translations)),
		...(admin ? ['', text(locale, 'usageAdmin')] : []),
		'',
		text(locale, 'usageReset'),
	].join('\n');
}
