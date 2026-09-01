# YouTubeSender

מנהל הפצת תוכן עצמאי ל־Home Assistant: סנכרון ערוצי YouTube, קמפיינים, אנשי קשר, היסטוריית מסירה, ספקי שליחה וטיוטות AI — בממשק עברי, רספונסיבי ו־PWA.

## התקנה ב־Home Assistant

הוסיפו את המאגר `https://github.com/r11a/YouTubeSender` לחנות ה־Apps, התקינו את **YouTubeSender**, הגדירו YouTube API Key ופתחו את ממשק ה־Web.

## פיתוח מקומי

```bash
cd youtube_sender
npm test
npm start
```

האפליקציה זמינה ב־`http://localhost:8099`. נתוני פיתוח נשמרים תחת `.data`.

## יכולות

- ערוצי YouTube מרובים וסנכרון דרך uploads playlist הרשמי
- ספריית וידאו עם צפייה בתוך האפליקציה ונתוני צפיות/תגובות
- קמפיינים מתוזמנים, קבוצות אנשי קשר והגנת כפילויות
- Assisted WhatsApp, קישור Email ו־Telegram Share
- יבוא CSV ו־vCard מאנדרואיד ומ־iPhone
- ארכיון מסירות בלתי־מחיק עם המלל המדויק
- שירות AI ניתן להחלפה (OpenAI / Gemini / תבנית מקומית)
- PWA, התקנה למסך הבית, מצב offline בסיסי ו־Ingress

ראו [תיעוד ה־Add-on](youtube_sender/DOCS.md).

