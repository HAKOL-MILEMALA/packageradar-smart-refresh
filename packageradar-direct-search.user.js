// ==UserScript==
// @name         PackageRadar - חיפוש ישיר
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  דילוג אוטומטי על חלונית התשלום, ללא הפרעה לאתר ולתרגום גוגל
// @author       HAKOL-MILEMALA
// @homepageURL  https://github.com/HAKOL-MILEMALA/packageradar-smart-refresh
// @supportURL   https://github.com/HAKOL-MILEMALA/packageradar-smart-refresh/issues
// @updateURL    https://raw.githubusercontent.com/HAKOL-MILEMALA/packageradar-smart-refresh/main/packageradar-direct-search.user.js
// @downloadURL  https://raw.githubusercontent.com/HAKOL-MILEMALA/packageradar-smart-refresh/main/packageradar-direct-search.user.js
// @match        https://packageradar.com/*
// @match        https://en.packageradar.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const SEARCH_BUTTON = 'button[name="tracking_form[track]"]';
    const DECLINE_BUTTON = [
        '.gtp-overlay button[data-gtp-decline]',
        '.gtp-overlay button.gtp-decline',
        'button[data-gtp-decline]',
        'button.gtp-decline'
    ].join(',');

    const MAX_WAIT = 8000;
    const CLICK_DELAY = 350;
    const DUPLICATE_GUARD = 800;

    let observer = null;
    let waitTimer = null;
    let clickTimer = null;
    let lastStartTime = 0;

    function log(message) {
        console.log('[PackageRadar] ' + message);
    }

    function warn(message) {
        console.warn('[PackageRadar] ' + message);
    }

    // בדיקת נראות של אלמנט, כולל ההורים שלו
    function isVisible(element) {
        if (!element || !element.isConnected || element.disabled) {
            return false;
        }

        let current = element;

        while (current && current.nodeType === 1) {
            if (
                current.hidden ||
                current.getAttribute('aria-hidden') === 'true'
            ) {
                return false;
            }

            const style = window.getComputedStyle(current);

            if (
                style.display === 'none' ||
                style.visibility === 'hidden'
            ) {
                return false;
            }

            current = current.parentElement;
        }

        return element.getClientRects().length > 0;
    }

    // איתור כפתור הסירוב האמיתי של החלונית
    function findDeclineButton() {
        return Array.from(
            document.querySelectorAll(DECLINE_BUTTON)
        ).find(isVisible) || null;
    }

    // ניקוי המעקב והטיימרים
    function stopWatching() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        if (waitTimer !== null) {
            clearTimeout(waitTimer);
            waitTimer = null;
        }

        if (clickTimer !== null) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }
    }

    // בדיקה אם החלונית הופיעה
    function checkPopup() {
        if (!observer || clickTimer !== null) {
            return;
        }

        const button = findDeclineButton();

        if (!button) {
            return;
        }

        log('חלונית התשלום זוהתה. ממתין לטעינת הכפתור...');

        // השהיה קצרה כדי לאפשר לאתר להשלים את אתחול החלונית
        clickTimer = setTimeout(() => {
            clickTimer = null;

            if (!observer) {
                return;
            }

            // איתור מחדש: ייתכן ש-Google Translate שינה את ה-DOM
            const currentButton = findDeclineButton();

            if (!currentButton) {
                log('הכפתור השתנה או החלונית נסגרה. ממשיך להמתין.');
                return;
            }

            log('נמצא כפתור הסירוב. שולח לחיצה.');

            // מפסיקים את המעקב לפני הלחיצה כדי למנוע הפעלות כפולות
            stopWatching();

            try {
                currentButton.click();
                log('נשלחה לחיצה על כפתור הסירוב.');

                // בדיקת הצלחת הסגירה
                setTimeout(() => {
                    const stillOpen = findDeclineButton();

                    if (!stillOpen) {
                        log('החלונית נסגרה בהצלחה.');
                    } else {
                        warn('החלונית עדיין קיימת. כדאי לבדוק את הלוגים.');
                    }
                }, 900);

            } catch (error) {
                warn('שגיאה בעת הלחיצה: ' + error.message);
            }

        }, CLICK_DELAY);
    }

    // התחלת מעקב אחר הופעת החלונית
    function startPopupObserver(source) {
        // מניעת מעקבים כפולים בעקבות click וגם submit
        if (observer) {
            log('מעקב כבר פעיל. לא מופעל מעקב נוסף.');
            return;
        }

        const now = Date.now();

        if (now - lastStartTime < DUPLICATE_GUARD) {
            return;
        }

        lastStartTime = now;

        log('זוהתה פעולת חיפוש (' + source + '). ממתין לחלונית...');

        const root = document.documentElement;

        if (!root) {
            warn('לא נמצא documentElement.');
            return;
        }

        observer = new MutationObserver(checkPopup);

        // מעקב אחר הוספת החלונית וגם אחר שינויי התצוגה שלה
        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'class',
                'style',
                'hidden',
                'aria-hidden'
            ]
        });

        // מגבלת זמן כדי שלא יישאר מעקב פעיל ללא צורך
        waitTimer = setTimeout(() => {
            if (observer) {
                stopWatching();
                warn('לא נמצאה חלונית בתוך 8 שניות. המעקב הופסק.');
            }
        }, MAX_WAIT);

        // בדיקה מיידית למקרה שהחלונית כבר הופיעה
        checkPopup();
    }

    // בדיקת אלמנט מול כפתור החיפוש
    function isSearchButton(element) {
        return !!(
            element &&
            element.nodeType === 1 &&
            typeof element.matches === 'function' &&
            element.matches(SEARCH_BUTTON)
        );
    }

    // האזנה ללחיצה על כפתור החיפוש
    // composedPath מאפשר זיהוי גם כשהלחיצה היא על תגית font של Google Translate
    document.addEventListener('click', function(event) {
        const path = typeof event.composedPath === 'function'
            ? event.composedPath()
            : [event.target];

        const isSearchClick = path.some(isSearchButton);

        if (isSearchClick) {
            startPopupObserver('לחיצת עכבר');
        }
    }, true);

    // האזנה להגשת טופס, כולל לחיצה על Enter
    document.addEventListener('submit', function(event) {
        const form = event.target;
        const submitter = event.submitter;

        const isSearchSubmit =
            isSearchButton(submitter) ||
            (
                form &&
                form.tagName === 'FORM' &&
                form.querySelector(SEARCH_BUTTON)
            );

        if (isSearchSubmit) {
            startPopupObserver('שליחת טופס / Enter');
        }
    }, true);

    log('הסקריפט הופעל בהצלחה ומוכן לחיפוש.');

})();
