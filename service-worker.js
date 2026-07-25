// ==========================================
// YLY System - Service Worker
// ==========================================

const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `yly-system-cache-${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';

// الأصول الأساسية التي يجب تخزينها فور تثبيت التطبيق (App Shell)
const CORE_ASSETS = [
    './',
    './index.html',
    './offline.html',
    './manifest.json',
    // Tailwind CSS
    'https://cdn.tailwindcss.com',
    // Google Fonts
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap',
    // Logo
    'https://res.cloudinary.com/dsxrjmcxs/image/upload/c_limit,w_400,q_auto,f_auto/v1784657850/s60xlqx1otmwcijtjw1l.png'
];

// ==========================================
// 1. Install Event (تثبيت وتخزين الأصول الأساسية)
// ==========================================
self.addEventListener('install', (event) => {
    self.skipWaiting(); // إجبار الـ SW الجديد على العمل فوراً دون انتظار إغلاق التبويبات
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching App Shell');
                // نستخدم catch لتجنب فشل التثبيت بالكامل إذا فشل تحميل ملف واحد
                return Promise.all(
                    CORE_ASSETS.map(url => {
                        return cache.add(url).catch(err => console.warn(`[ServiceWorker] Failed to cache ${url}:`, err));
                    })
                );
            })
    );
});

// ==========================================
// 2. Activate Event (تنظيف النسخ القديمة)
// ==========================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // حذف أي كاش قديم لا يطابق الإصدار الحالي
                    if (cacheName.startsWith('yly-system-cache-') && cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim(); // السيطرة على كل الصفحات المفتوحة فوراً
        })
    );
});

// ==========================================
// 3. Fetch Event (استراتيجية جلب البيانات)
// ==========================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // تجاهل طلبات Firebase و APIs الخارجية (يجب أن تكون دائماً Network Only)
    if (url.hostname.includes('firestore.googleapis.com') || 
        url.hostname.includes('firebase') || 
        url.hostname.includes('identitytoolkit')) {
        return;
    }

    // استراتيجية 1: ملفات الـ HTML الأساسية (Network First, falling back to Cache, then Offline Page)
    if (request.mode === 'navigate' || request.headers.get('accept').includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // تحديث الكاش بالنسخة الجديدة من الشبكة
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    return response;
                })
                .catch(() => {
                    // في حالة انقطاع الإنترنت، جلب من الكاش، وإذا لم يوجد نعرض صفحة الأوفلاين
                    return caches.match(request).then((cachedResponse) => {
                        return cachedResponse || caches.match(OFFLINE_URL);
                    });
                })
        );
        return;
    }

    // استراتيجية 2: المكتبات الثقيلة المحملة كسولاً (Cache First, falling back to Network)
    // مثل: xlsx, html5-qrcode
    if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('cdn.jsdelivr.net')) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                
                return fetch(request).then((response) => {
                    if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
                        return response;
                    }
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    return response;
                }).catch(err => console.warn('[ServiceWorker] Fetch failed for library:', err));
            })
        );
        return;
    }

    // استراتيجية 3: الصور والأصول الأخرى (Stale-While-Revalidate)
    // يعرض النسخة المخبأة فوراً لسرعة العرض، ويحدثها في الخلفية للمرة القادمة
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return networkResponse;
            }).catch(() => {
                // تجاهل أخطاء الشبكة للصور
            });

            return cachedResponse || fetchPromise;
        })
    );
});