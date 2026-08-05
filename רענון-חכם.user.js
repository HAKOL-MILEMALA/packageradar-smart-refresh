// ==UserScript==
// @name         PackageRadar - רענון חכם
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  הוספת סקריפט רענון חכם עבור PackageRadar
// @author       HAKOL-MILEMALA
// @match        https://packageradar.com/tracks
// @updateURL    https://github.com/HAKOL-MILEMALA/packageradar-smart-refresh/raw/refs/heads/main/%D7%A8%D7%A2%D7%A0%D7%95%D7%9F-%D7%97%D7%9B%D7%9D.user.js
// @downloadURL  https://github.com/HAKOL-MILEMALA/packageradar-smart-refresh/raw/refs/heads/main/%D7%A8%D7%A2%D7%A0%D7%95%D7%9F-%D7%97%D7%9B%D7%9D.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- הגדרות ---
    const BATCH_SIZE = 3; // עיבוד 3 חבילות יחד
    const DELAY_BETWEEN_BATCHES_MS = 500; // המתנה בין קבוצות
    // --------------

    let isRunning = false;

    function addBtn() {
        if(document.getElementById('pr-auto-refresh')) return;

        let btn = document.createElement("button");
        btn.id = 'pr-auto-refresh';
        btn.innerHTML = "🚀 רענן הכל";
        setupBtnStyle(btn, "start");

        document.body.appendChild(btn);

        btn.onclick = function() {
            if (btn.dataset.state === "finished") {
                location.reload();
                return;
            }
            if (!isRunning) {
                startBatchedUpdate();
            }
        };
    }

    function setupBtnStyle(btn, state) {
        btn.style.position = "fixed";
        btn.style.bottom = "20px";
        btn.style.left = "20px";
        btn.style.zIndex = "99999";
        btn.style.padding = "12px 20px";
        btn.style.border = "none";
        btn.style.borderRadius = "5px";
        btn.style.fontSize = "16px";
        btn.style.fontWeight = "bold";
        btn.style.cursor = "pointer";
        btn.style.boxShadow = "0px 2px 5px rgba(0,0,0,0.3)";
        btn.disabled = false;

        if (state === "start") {
            btn.style.backgroundColor = "#d9534f"; // אדום
            btn.style.color = "white";
            btn.dataset.state = "start";
        } else if (state === "running") {
            btn.style.backgroundColor = "#333"; // שחור
            btn.style.color = "white";
            btn.dataset.state = "running";
            btn.disabled = true;
        } else if (state === "finished") {
            btn.style.backgroundColor = "#008000"; // ירוק
            btn.style.color = "white";
            btn.dataset.state = "finished";
        }
    }

    function extractTextFromHtml(htmlString) {
        try {
            let tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlString;
            let closeBtns = tempDiv.querySelectorAll('button');
            closeBtns.forEach(b => b.remove());
            return (tempDiv.innerText || tempDiv.textContent).replace(/\s+/g, ' ').trim();
        } catch (e) { return ""; }
    }

    async function processPackage(packageUrl) {
        let packageId = packageUrl.split('/').pop();
        const prefix = `[📦 ${packageId}]`; // תגית זיהוי לכל שורה

        console.log(`%c${prefix} 1️⃣ 🔗 ניגש לדף החבילה וטוען נתונים...`, "color: #007bff; font-weight: bold;");

        try {
            // ממתינים לטעינת דף החבילה עצמו (זה הכרחי כדי לחלץ את קישור הרענון)
            let response = await fetch(packageUrl);

            if (response.status === 429) {
                console.log(`%c${prefix} ⛔ נחסם! השרת מתלונן על עומס בקשות לדפים (429).`, "color: red; font-weight: bold;");
                return false;
            }
            if (!response.ok) {
                console.log(`%c${prefix} ⚠️ שגיאת שרת כללית בטעינת הדף (${response.status}).`, "color: orange;");
                return false;
            }

            console.log(`%c${prefix} 2️⃣ 📥 הדף נטען בהצלחה. סורק את המבנה...`, "color: #17a2b8;");
            let html = await response.text();
            let parser = new DOMParser();
            let doc = parser.parseFromString(html, "text/html");

            let refreshBtn = doc.querySelector('a[data-url*="/refresh"]');

            if (refreshBtn) {
                console.log(`%c${prefix} 3️⃣ 🎯 מעולה! כפתור רענון אותר. משגר בקשת רענון ברקע וממשיך...`, "color: #fd7e14; font-weight: bold;");
                let refreshUrl = refreshBtn.getAttribute('data-url');

                // --- השינוי כאן: שולחים את הבקשה אבל *לא* עושים לה await! ---
                // פעולת הרענון מתבצעת ברקע, והסקריפט מדלג מיד הלאה.
                fetch(refreshUrl, {
                    headers: {'X-Requested-With': 'XMLHttpRequest'}
                }).then(async (apiResponse) => {
                    if (apiResponse.ok) {
                        console.log(`%c${prefix} 4️⃣ 📡 [ברקע] התקבלה תשובה מהשרת, מפענח...`, "color: #20c997;");
                        let json = await apiResponse.json();
                        let rawHtml = json.html || "";
                        let cleanMsg = extractTextFromHtml(rawHtml);
                        if (!cleanMsg) cleanMsg = json.message || json.msg || "בוצע";

                        // ניתוח התשובה הסופית
                        let statusIcon = "❓";
                        let statusHebrew = "תשובה לא מזוהה:";
                        let logColor = "color: black;";

                        let lowerMsg = cleanMsg.toLowerCase();
                        if (lowerMsg.includes('unavailable') || lowerMsg.includes('6 hours') || lowerMsg.includes('wait')) {
                            statusIcon = "⏳";
                            statusHebrew = "לא ניתן לרענן (יש להמתין)";
                            logColor = "color: #d9534f; font-weight: bold; background: #fdf2f2; padding: 2px;"; // אדום-חלש
                        }
                        else if (lowerMsg.includes('success') || lowerMsg.includes('עודכן') || lowerMsg.includes('ok') || lowerMsg.includes('בוצע')) {
                            statusIcon = "✅";
                            statusHebrew = "עודכן בהצלחה!";
                            logColor = "color: #28a745; font-weight: bold; background: #e8f5e9; padding: 2px;"; // ירוק
                        }

                        console.log(`%c${prefix} 5️⃣ [ברקע] ${statusIcon} ${statusHebrew} => "${cleanMsg}"`, logColor);
                    } else if (apiResponse.status === 429) {
                         console.log(`%c${prefix} ❌ [ברקע] בקשת הרענון נחסמה בגלל עומס (429).`, "color: red; font-weight: bold;");
                    }
                }).catch(e => {
                    console.error(`💥 ${prefix} [ברקע] שגיאת רשת בשליחת הרענון:`, e);
                });

                // מחזירים true מיד אחרי השיגור, כדי שהתור ירוץ מהר!
                return true;
            } else {
                console.log(`%c${prefix} 🛑 לא נמצא כפתור רענון. (כנראה לא עבר מספיק זמן מהבדיקה הקודמת).`, "color: #6c757d; font-style: italic;");
            }
            return false;
        } catch (e) {
            console.error(`💥 ${prefix} שגיאת קוד/רשת לא צפויה בשלב טעינת הדף:`, e);
            return false;
        }
    }

    async function startBatchedUpdate() {
        let btn = document.getElementById('pr-auto-refresh');
        let links = Array.from(document.querySelectorAll('a[href*="/tracking/"]'))
                         .filter(a => !a.href.endsWith('/tracking/') && !a.href.includes('/review'));
        let uniqueLinks = [...new Set(links.map(a => a.href))];

        if (uniqueLinks.length === 0) {
            alert("לא נמצאו חבילות סרוקות!");
            return;
        }

        isRunning = true;
        setupBtnStyle(btn, "running");
        console.clear();
        console.log(`%c🚀 יוצאים לדרך! נמצאו ${uniqueLinks.length} חבילות בסך הכל.`, "color: purple; font-weight: bold; font-size: 16px; background: #f3e5f5; padding: 5px;");

        for (let i = 0; i < uniqueLinks.length; i += BATCH_SIZE) {
            const batch = uniqueLinks.slice(i, i + BATCH_SIZE);
            btn.innerHTML = `⚡ מעבד: ${Math.min(i + BATCH_SIZE, uniqueLinks.length)} / ${uniqueLinks.length}`;

            console.log(`\n%c📦 >>> מתחיל קבוצה ${Math.floor(i/BATCH_SIZE) + 1} (חבילות ${i + 1} עד ${Math.min(i + BATCH_SIZE, uniqueLinks.length)}) <<<`, "color: black; font-weight: bold; background: #e0e0e0; padding: 3px; display: block;");

            await Promise.all(batch.map(url => processPackage(url)));

            if (i + BATCH_SIZE < uniqueLinks.length) {
                console.log(`%c⏱️ ממתין ${DELAY_BETWEEN_BATCHES_MS/1000} שניות כדי לא להעמיס על השרת...`, "color: gray; font-style: italic;");
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
            }
        }

        isRunning = false;
        setupBtnStyle(btn, "finished");

        console.log("\n%c✨ עיבוד כל החבילות הסתיים בהצלחה! מתחיל ספירה לאחור...", "color: blue; font-size: 14px; font-weight: bold; background: #e6f7ff; padding: 5px;");

        let countdown = 15;
        const timer = setInterval(() => {
            btn.innerHTML = `🔄 סיימנו! מרענן דף בעוד ${countdown}...`;
            if (countdown <= 0) {
                clearInterval(timer);
                location.reload();
            }
            countdown--;
        }, 1500);
    }

    window.addEventListener('load', addBtn);
    setTimeout(addBtn, 1500);
})();
