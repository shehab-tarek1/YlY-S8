import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, onSnapshot, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ==========================================
// 1. Firebase Configuration & Initialization
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyA3RA_xuVJrvnWXyeimFc9XZJZUvRfLZwk",
    authDomain: "yly-s8.firebaseapp.com",
    projectId: "yly-s8",
    storageBucket: "yly-s8.firebasestorage.app",
    messagingSenderId: "458258014168",
    appId: "1:458258014168:web:0042876c0d9f78620d5cad",
    measurementId: "G-GTGY0MP3NH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==========================================
// 2. Global State
// ==========================================
const state = {
    members: [],
    attendance: [],
    accounting: [],
    dayAttForInternal: [],
    currentModalStudentId: null,
    currentReportData: { present: [], absent: [], points: [], combined: [] },
    loginMode: 'admin',
    isPrinting: false,
    currentPage: 1,
    itemsPerPage: 10,
    attCurrentPage: 1,
    reportCurrentPage: 1,
    currentAttType: 'present',
    currentReportCategory: 'combined',
    html5QrCode: null,
    isScannerRunning: false,
    isScannerTransitioning: false, // حماية التشغيل والإيقاف السريع
    isPaused: false,
    isLoggingOut: false,
    currentPayStudent: null,
    attCachedList: []
};

const stageMap = { "HR": "الموارد البشرية (HR)", "PR": "العلاقات العامة (PR)", "OR": "التنظيم (OR)", "SM": "السوشيال ميديا (SM)" };

function getEgyptDate() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}
let today = getEgyptDate();
let selectedAttendanceDate = today;

// ==========================================
// 3. Security & Utilities
// ==========================================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeArabic(text) {
    if(!text) return '';
    return text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

window.showToast = function(msg, type) {
    const t = document.getElementById('toast');
    if(!t) return;
    t.innerText = msg;
    // تركنا التصميم الأساسي وأضفنا اللون كـ Style مباشر لا يعتمد على مكتبة
    t.className = 'fixed top-5 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-xl font-bold text-xs md:text-sm max-w-[90%] w-auto text-center whitespace-nowrap text-white z-[999999]';
    t.style.backgroundColor = type === 'success' ? '#16a34a' : '#dc2626'; 
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

let audioCtx = null;
function playSound(type) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        osc.connect(audioCtx.destination);
        if(type === 'success') {
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        } else {
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.2);
        }
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } catch(e) {}
}

// ==========================================
// 4. Lazy Loaders
// ==========================================
let isXlsxLoaded = false;
async function requireXLSX() {
    if (isXlsxLoaded) return;
    return new Promise((resolve, reject) => {
        window.showToast('جاري تحضير الإكسيل...', 'success');
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
        script.onload = () => { isXlsxLoaded = true; resolve(); };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

let isHtml2PdfLoaded = false;
async function requireHtml2Pdf() {
    if (isHtml2PdfLoaded) return;
    return new Promise((resolve, reject) => {
        window.showToast('جاري تحضير محرك PDF...', 'success');
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        script.onload = () => { isHtml2PdfLoaded = true; resolve(); };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

let isQrLoaded = false;
async function requireQRScanner() {
    if (isQrLoaded) return;
    return new Promise((resolve, reject) => {
        const script1 = document.createElement('script');
        script1.src = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
        script1.onload = () => {
            const script2 = document.createElement('script');
            script2.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
            script2.onload = () => { isQrLoaded = true; resolve(); };
            document.head.appendChild(script2);
        };
        document.head.appendChild(script1);
    });
}

async function generateQRBase64(text) {
    await requireQRScanner();
    return new Promise((resolve) => {
        const holder = document.createElement('div');
        holder.style.display = 'none';
        document.body.appendChild(holder);
        new QRCode(holder, { text: text, width: 100, height: 100, correctLevel : QRCode.CorrectLevel.H });
        setTimeout(() => {
            const img = holder.querySelector('img');
            const canvas = holder.querySelector('canvas');
            let src = '';
            if (img && img.src) src = img.src;
            else if (canvas) src = canvas.toDataURL();
            document.body.removeChild(holder);
            resolve(src ? `<img src="${src}" style="width:100px !important; height:100px !important; margin:0 auto !important; display:block !important;" />` : '');
        }, 300);
    });
}

// ==========================================
// 5. Auth & Observers
// ==========================================
const loading = document.getElementById('loadingOverlay');
const failSafeTimer = setTimeout(() => {
    if(loading && loading.style.display !== 'none') {
        loading.style.opacity = '0';
        setTimeout(() => loading.style.display = 'none', 300);
    }
}, 5000);

let unsubMembers = null; let unsubAttendance = null; let unsubAccounting = null;
function clearAllListeners() {
    if (unsubMembers) { unsubMembers(); unsubMembers = null; }
    if (unsubAttendance) { unsubAttendance(); unsubAttendance = null; }
    if (unsubAccounting) { unsubAccounting(); unsubAccounting = null; }
}

onAuthStateChanged(auth, (user) => {
    clearTimeout(failSafeTimer);
    clearAllListeners();
    const savedMode = localStorage.getItem('loginMode');
    
    if (user) {
        if (savedMode === 'admin' || user.uid === "Y3XYVlXxj7bJwEWas9Hx0DqfPi92") {
            unsubMembers = onSnapshot(collection(db, "members"), (snapshot) => {
                state.members = [];
                snapshot.forEach(doc => state.members.push({ ...doc.data(), docId: doc.id }));
                window.renderStudents();
                window.updateCounters();
                if(loading) { loading.style.opacity = '0'; setTimeout(() => loading.style.display = 'none', 300); }
            });
            
            setTimeout(() => {
                const attQuery = query(collection(db, "attendance"), where("date", "==", today));
                unsubAttendance = onSnapshot(attQuery, (snapshot) => {
                    state.attendance = [];
                    snapshot.forEach(doc => state.attendance.push({ ...doc.data(), docId: doc.id }));
                    window.updateCounters();
                });
                
                const accQuery = query(collection(db, "accounting"), where("date", "==", today));
                unsubAccounting = onSnapshot(accQuery, (snapshot) => {
                    state.accounting = [];
                    snapshot.forEach(doc => state.accounting.push({ ...doc.data(), docId: doc.id }));
                    window.updateFinance();
                });
            }, 1000);
        } else {
            const memberCode = localStorage.getItem('currentStudentId') || (user.email ? user.email.split('@')[0] : '');
            unsubMembers = onSnapshot(query(collection(db, "members"), where("id", "==", memberCode)), (snapshot) => {
                if (localStorage.getItem('loginMode') !== 'student') return;
                state.members = [];
                snapshot.forEach(doc => state.members.push({ ...doc.data(), docId: doc.id }));
                if(state.members.length > 0) {
                    loadStudentDashboard(state.members[0]);
                    document.getElementById('appContent').classList.remove('hidden');
                }
                if(loading) { loading.style.opacity = '0'; setTimeout(() => loading.style.display = 'none', 300); }
            });

            unsubAttendance = onSnapshot(query(collection(db, "attendance"), where("studentId", "in", [memberCode, "EVENT_MARKER"])), (snapshot) => {
                if (localStorage.getItem('loginMode') !== 'student') return;
                state.attendance = [];
                snapshot.forEach(doc => state.attendance.push({ ...doc.data(), docId: doc.id }));
                if(state.members.length > 0) updateStudentDashboardData(state.members[0]);
            });

            unsubAccounting = onSnapshot(query(collection(db, "accounting"), where("stdId", "==", memberCode)), (snapshot) => {
                if (localStorage.getItem('loginMode') !== 'student') return;
                state.accounting = [];
                snapshot.forEach(doc => state.accounting.push({ ...doc.data(), docId: doc.id }));
                if(state.members.length > 0) updateStudentDashboardData(state.members[0]);
            });
        }
    } else {
        if (!state.isLoggingOut && loading) {
            loading.style.opacity = '0';
            setTimeout(() => loading.style.display = 'none', 300);
        }
    }
});

window.onload = () => {
    today = getEgyptDate();
    if(document.getElementById('headerDate')) document.getElementById('headerDate').innerText = today;
    if(document.getElementById('attendanceDate')) document.getElementById('attendanceDate').value = today;
    if(document.getElementById('reportDate')) document.getElementById('reportDate').value = today;
    const reportMonthEl = document.getElementById('reportMonth');
    if(reportMonthEl) reportMonthEl.value = today.substring(0, 7);
    
    const savedLogin = localStorage.getItem('isLoggedIn');
    const savedMode = localStorage.getItem('loginMode');
    const savedTab = localStorage.getItem('activeTab');
    
    if (savedLogin === 'true') {
        document.getElementById('appContent').classList.remove('hidden');
        state.loginMode = savedMode;
        if (state.loginMode === 'admin') {
            document.getElementById('navBar').classList.remove('hidden');
            window.showTab(savedTab || 'students', document.getElementById(`nav-${savedTab || 'students'}`));
        } else {
            document.getElementById('navBar').classList.add('hidden');
        }
    } else {
        document.getElementById('loginOverlay').style.display = 'flex';
    }
};

window.setLoginMode = function(mode) {
    state.loginMode = mode;
    document.getElementById('tabAdmin').className = mode === 'admin' ? 'login-tab active' : 'login-tab';
    document.getElementById('tabStudent').className = mode === 'student' ? 'login-tab active' : 'login-tab';
    document.getElementById('loginCode').placeholder = mode === 'admin' ? 'البريد الإلكتروني للقيادة' : 'كود العضو';
    document.getElementById('loginCode').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').classList.add('hidden');
}

window.handleLogin = async function() {
    const code = document.getElementById('loginCode').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const errorMsg = document.getElementById('loginError');
    const loginBtn = document.querySelector('.login-btn');
    
    if(!code || !pass) {
        errorMsg.innerText = "يرجى إدخال جميع البيانات المطلوب الدخول بها";
        errorMsg.classList.remove('hidden');
        return;
    }
    
    errorMsg.classList.add('hidden');
    if (loginBtn) { loginBtn.innerText = "جاري تسجيل الدخول..."; loginBtn.disabled = true; loginBtn.style.opacity = "0.7"; }
    const resetLoginBtn = () => { if (loginBtn) { loginBtn.innerText = "تسجيل الدخول"; loginBtn.disabled = false; loginBtn.style.opacity = "1"; } };
    
    if (state.loginMode === 'admin') {
        try {
            localStorage.setItem('loginMode', 'admin');
            await signInWithEmailAndPassword(auth, code, pass);
            proceedLogin('admin');
        } catch (error) {
            localStorage.removeItem('loginMode');
            errorMsg.innerText = "بيانات الدخول غير صحيحة أو لا تملك صلاحية";
            errorMsg.classList.remove('hidden');
            resetLoginBtn();
        }
    } else {
        try {
            localStorage.setItem('loginMode', 'student');
            localStorage.setItem('currentStudentId', code);
            await signInWithEmailAndPassword(auth, `${code}@yly.app`, pass);
            proceedLogin('student');
        } catch (error) {
            try {
                const q = query(collection(db, "members"), where("id", "==", code), where("password", "==", pass));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    localStorage.setItem('loginMode', 'student');
                    localStorage.setItem('currentStudentId', code);
                    try {
                        await createUserWithEmailAndPassword(auth, `${code}@yly.app`, pass);
                    } catch(cErr) {
                        await signInWithEmailAndPassword(auth, `${code}@yly.app`, pass);
                    }
                    proceedLogin('student');
                } else {
                    errorMsg.innerText = "كود العضو أو كلمة المرور غير صحيحة";
                    errorMsg.classList.remove('hidden');
                    resetLoginBtn();
                }
            } catch(err) {
                errorMsg.innerText = "حدث خطأ أثناء الاتصال بقاعدة البيانات";
                errorMsg.classList.remove('hidden');
                resetLoginBtn();
            }
        }
    }
}

function proceedLogin(mode) {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('loginMode', mode);
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appContent').classList.remove('hidden');
    if (mode === 'admin') {
        document.getElementById('navBar').classList.remove('hidden');
        window.showTab('students', document.getElementById('nav-students'));
    } else {
        document.getElementById('navBar').classList.add('hidden');
    }
}

window.logout = async function() {
    try {
        state.isLoggingOut = true;
        const loading = document.getElementById('loadingOverlay');
        if(loading) { loading.style.display = 'flex'; loading.style.opacity = '1'; }
        if(auth && auth.currentUser) await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
    } finally {
        localStorage.clear();
        location.reload();
    }
}

// ==========================================
// 6. UI Controllers & Navigation
// ==========================================
window.showTab = async function(id, btn) {
    if(state.isScannerRunning) await window.stopScanner();
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if(btn) btn.classList.add('active');
    localStorage.setItem('activeTab', id);
    window.scrollTo(0, 0);
}

window.toggleCustomDropdown = function(event, menuId) {
    event.stopPropagation();
    const menu = document.getElementById(menuId);
    if(!menu) return;
    if (menu.classList.contains('hide')) {
        window.closeAllDropdowns();
        menu.classList.remove('hide');
        menu.classList.add('show');
    } else {
        menu.classList.remove('show');
        menu.classList.add('hide');
    }
}

window.closeAllDropdowns = function() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.remove('show');
        menu.classList.add('hide');
    });
}

window.selectCustomOption = function(hiddenInputId, displayInputId, menuId, value, text, callback) {
    const hiddenInput = document.getElementById(hiddenInputId);
    const displayInput = document.getElementById(displayInputId);
    if(hiddenInput) hiddenInput.value = value;
    if(displayInput) displayInput.value = text;
    window.closeAllDropdowns();
    if(typeof callback === 'function') callback(value);
}

window.selectLevel = function(value, text) {
    document.getElementById('stdLevel').value = value;
    document.getElementById('stdLevelDisplay').value = text;
    window.closeAllDropdowns();
}

window.closeModal = function(id) {
    document.getElementById(id).classList.add('hidden');
    document.body.classList.remove('modal-open');
    if(id === 'checkResultModal') {
        state.isPaused = false;
        if(state.html5QrCode) state.html5QrCode.resume();
    }
}

window.openInternalPage = function(id) {
    document.getElementById(id).classList.add('active');
    document.body.classList.add('internal-open');
    window.scrollTo(0, 0);
}

window.closeInternalPage = function(id) {
    document.getElementById(id).classList.remove('active');
    document.body.classList.remove('internal-open');
}

// ==========================================
// 7. Student Management
// ==========================================
window.validatePhone = function(input) {
    let val = input.value.replace(/\D/g, '');
    if (val.startsWith('0')) val = val.substring(1);
    if (val.length > 10) val = val.substring(0, 10);
    input.value = val;
}

window.registerStudent = async function() {
    const name = document.getElementById('stdName').value.trim();
    const level = document.getElementById('stdLevel').value;
    let ownPhone = document.getElementById('stdOwnPhone').value;
    
    if(!name || !level) return window.showToast('يرجى استكمال الاسم واللجنة', 'error');
    
    ownPhone = ownPhone.replace(/\D/g, '');
    if(ownPhone.startsWith('0')) ownPhone = ownPhone.substring(1);
    
    let id;
    do { id = Math.floor(1000 + Math.random() * 9000).toString(); } 
    while (state.members.some(s => s.id === id));
    
    const password = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = new Date().toISOString();
    
    try {
        await addDoc(collection(db, "members"), { id, name, level, phone: ownPhone, ownPhone, date: today, password, createdAt });
        window.openStudentModal(id);
        document.getElementById('stdName').value = '';
        document.getElementById('stdOwnPhone').value = '';
        document.getElementById('stdLevel').value = '';
        document.getElementById('stdLevelDisplay').value = '';
        window.showToast('تم حفظ العضو بنجاح', 'success');
    } catch (e) {
        window.showToast('حدث خطأ أثناء الحفظ', 'error');
    }
}

window.handleSearch = debounce(() => {
    state.currentPage = 1;
    window.renderStudents();
}, 300);

window.renderStudents = function() {
    const queryStr = normalizeArabic(document.getElementById('searchStd').value.toLowerCase().trim());
    const filterStage = document.getElementById('studentListFilter').value;
    const tbody = document.getElementById('studentsTable');
    if(!tbody) return;
    
    let filtered = state.members;
    if(filterStage !== 'all') filtered = filtered.filter(s => s.level === filterStage);
    if(queryStr !== '') filtered = filtered.filter(s => normalizeArabic((s.name || '').toLowerCase()).includes(queryStr) || (s.id || '').includes(queryStr));
    
    // خوارزمية الترتيب الأبجدي + أولوية الاسم الأول في البحث
    filtered.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        
        if (queryStr !== '') {
            const normA = normalizeArabic(nameA.toLowerCase().trim());
            const normB = normalizeArabic(nameB.toLowerCase().trim());
            
            const startsA = normA.startsWith(queryStr);
            const startsB = normB.startsWith(queryStr);
            
            // أولوية لمن يقع مصطلح البحث في بداية اسمه
            if (startsA && !startsB) return -1;
            if (!startsA && startsB) return 1;
        }
        
        // الترتيب الأبجدي العربي الحقيقي (أ - ب - ت...)
        return nameA.localeCompare(nameB, 'ar', { sensitivity: 'base' });
    });
    
    document.getElementById('stdCount').innerText = filtered.length;
    const totalPages = Math.ceil(filtered.length / state.itemsPerPage) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;
    
    const start = (state.currentPage - 1) * state.itemsPerPage;
    const end = start + state.itemsPerPage;
    const pageItems = filtered.slice(start, end);
    
    tbody.innerHTML = pageItems.map((s, index) => `
        <tr class="cursor-pointer" onclick="openStudentModal('${escapeHTML(s.id)}')">
            <td class="col-index">${start + index + 1}</td>
            <td class="col-code font-mono font-bold text-gray-900">${escapeHTML(s.id)}</td>
            <td class="font-bold whitespace-normal leading-tight">${escapeHTML(s.name)}</td>
            <td>${escapeHTML(stageMap[s.level] || s.level)}</td>
            <td class="col-date text-gray-500">${escapeHTML(s.date || '-')}</td>
            <td class="no-print col-action" onclick="event.stopPropagation()">
                <button onclick="delStudent('${s.docId}', '${escapeHTML(s.id)}')" class="text-red-500 text-[10px] font-bold">حذف</button>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('pageIndicator').innerText = `صفحة ${state.currentPage} من ${totalPages}`;
}

window.nextPage = function() { state.currentPage++; window.renderStudents(); }
window.prevPage = function() { state.currentPage--; window.renderStudents(); }

window.openStudentModal = async function(id) {
    const s = state.members.find(st => st.id === id);
    if(!s) return;
    state.currentModalStudentId = id;
    const card = document.getElementById('studentCardDisplay');
    
    card.innerHTML = `
        <div class="unified-card-title">بطاقة عضو YLY</div>
        <div class="unified-card-name">${escapeHTML(s.name)}</div>
        <div id="modalQr" style="display:flex; justify-content:center; margin:10px 0;"></div>
        <div class="unified-card-row"><span>كود العضو:</span> <span>${escapeHTML(s.id)}</span></div>
        <div class="unified-card-row"><span>كلمة السر:</span> <span>${escapeHTML(s.password || '----')}</span></div>
        <div class="unified-card-row"><span>اللجنة:</span> <span>${escapeHTML(stageMap[s.level] || s.level)}</span></div>
        <div class="unified-card-row"><span>رقم الهاتف:</span> <span><a href="https://wa.me/20${escapeHTML(s.ownPhone || s.phone)}" target="_blank" class="text-blue-600 hover:underline">${escapeHTML(s.ownPhone || s.phone || 'غير مسجل')}</a></span></div>
        <div class="unified-card-row"><span>تاريخ الانضمام:</span> <span>${escapeHTML(s.date)}</span></div>
        <div class="unified-card-footer">YLY System</div>
    `;
    
    await requireQRScanner();
    const qrDiv = document.getElementById("modalQr");
    if(qrDiv) {
        qrDiv.innerHTML = '';
        new QRCode(qrDiv, { text: s.id, width: 100, height: 100 });
    }
    document.getElementById('studentModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

window.delStudent = async function(docId, studentId) {
    if(!confirm('سيتم حذف العضو وجميع سجلات حضوره ونقاطه! هل أنت متأكد؟')) return;
    try {
        const attQuery = query(collection(db, "attendance"), where("studentId", "==", studentId));
        const attSnapshot = await getDocs(attQuery);
        attSnapshot.forEach(d => deleteDoc(d.ref));
        
        const accQuery = query(collection(db, "accounting"), where("stdId", "==", studentId));
        const accSnapshot = await getDocs(accQuery);
        accSnapshot.forEach(d => deleteDoc(d.ref));
        
        await deleteDoc(doc(db, "members", docId));
        window.showToast('تم حذف العضو وكل بياناته', 'success');
    } catch (e) {
        window.showToast('حدث خطأ أثناء الحذف', 'error');
    }
}

// ==========================================
// 8. Attendance Logic
// ==========================================
function getStudentStatusForDate(member, dateStr) {
    const sourceAtt = (dateStr === today) ? state.attendance : (state.dayAttForInternal || []);
    const attendanceRecord = sourceAtt.find(r => r.date === dateStr && r.studentId === member.id);
    const eventRec = sourceAtt.find(r => r.studentId === "EVENT_MARKER" && r.date === dateStr);
    const isExpectedToAttend = eventRec && (!eventRec.levels || eventRec.levels.includes('all') || eventRec.levels.includes(member.level));
    
    if (attendanceRecord) return { status: 'present', time: attendanceRecord.time };
    if (isExpectedToAttend) return { status: 'absent' };
    return { status: 'none' };
}

window.changeAttendanceDate = async function() {
    selectedAttendanceDate = document.getElementById('attendanceDate').value;
    document.getElementById('presentCount').innerText = '...';
    document.getElementById('absentCount').innerText = '...';
    
    if (selectedAttendanceDate !== today) {
        const attQ = query(collection(db, "attendance"), where("date", "==", selectedAttendanceDate));
        const snap = await getDocs(attQ);
        state.dayAttForInternal = [];
        snap.forEach(d => state.dayAttForInternal.push(d.data()));
    } else {
        state.dayAttForInternal = state.attendance;
    }
    window.updateCounters();
}

window.updateCounters = function() {
    const selectedLevel = document.getElementById('attendanceStage').value;
    const date = selectedAttendanceDate;
    const sourceAtt = (date === today) ? state.attendance : (state.dayAttForInternal || []);
    const eventRec = sourceAtt.find(r => r.studentId === "EVENT_MARKER" && r.date === date);
    
    const indicator = document.getElementById('exceptionalStatusIndicator');
    const levelNameSpan = document.getElementById('exceptionalLevelName');
    
    if (eventRec) {
        let levelsText = eventRec.levels.includes('all') ? "الكل" : eventRec.levels.map(l => stageMap[l]).join('، ');
        if(levelNameSpan) levelNameSpan.innerText = escapeHTML(levelsText);
        if(indicator) indicator.classList.remove('hidden');
    } else {
        if(indicator) indicator.classList.add('hidden');
    }
    
    let targetMembers = state.members.filter(s => s.date <= date);
    if(selectedLevel !== 'all') targetMembers = targetMembers.filter(s => s.level === selectedLevel);
    
    let presentCount = 0; let absentCount = 0;
    targetMembers.forEach(member => {
        const statusObj = getStudentStatusForDate(member, date);
        if (statusObj.status === 'present') presentCount++;
        else if (statusObj.status === 'absent') absentCount++;
    });
    
    if(document.getElementById('presentCount')) document.getElementById('presentCount').innerText = presentCount;
    if(document.getElementById('absentCount')) document.getElementById('absentCount').innerText = absentCount;
}

window.confirmEventDay = async function() {
    const date = document.getElementById('attendanceDate').value;
    const selectedLevel = document.getElementById('attendanceStage').value;
    if(!selectedLevel) return window.showToast('يجب اختيار اللجنة أولاً!', 'error');
    
    const eventQuery = query(collection(db, "attendance"), where("studentId", "==", "EVENT_MARKER"), where("date", "==", date));
    const snapshot = await getDocs(eventQuery);
    let newLevels = [];
    
    if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        const currentData = snapshot.docs[0].data();
        let currentLevels = currentData.levels || [];
        if (selectedLevel === 'all') newLevels = ['all'];
        else {
            if (currentLevels.includes('all')) currentLevels = [];
            if (!currentLevels.includes(selectedLevel)) currentLevels.push(selectedLevel);
            newLevels = currentLevels;
        }
        await updateDoc(docRef, { levels: newLevels });
    } else {
        newLevels = selectedLevel === 'all' ? ['all'] : [selectedLevel];
        await addDoc(collection(db, "attendance"), {
            date: date,
            studentId: "EVENT_MARKER",
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
            levels: newLevels
        });
    }
    window.showToast(`تم التفعيل بنجاح`, 'success');
    if(date !== today) await window.changeAttendanceDate();
}

window.cancelEventDay = async function() {
    const date = document.getElementById('attendanceDate').value;
    document.getElementById('exceptionalStatusIndicator').classList.add('hidden');
    
    const eventQuery = query(collection(db, "attendance"), where("studentId", "==", "EVENT_MARKER"), where("date", "==", date));
    const snapshot = await getDocs(eventQuery);
    
    if (!snapshot.empty) {
        snapshot.forEach(async (d) => await deleteDoc(d.ref));
        const attQuery = query(collection(db, "attendance"), where("date", "==", date));
        const attSnapshot = await getDocs(attQuery);
        attSnapshot.forEach(async (d) => {
            if (d.data().studentId !== "EVENT_MARKER") await deleteDoc(d.ref);
        });
        window.showToast('تم إلغاء التفعيل ومسح السجلات', 'success');
        if(date !== today) await window.changeAttendanceDate();
    } else {
        window.showToast('لم يتم تفعيل هذا اليوم مسبقاً', 'warning');
    }
}

window.manualAttendance = async function() {
    const input = document.getElementById('manualAttID');
    const id = input.value ? input.value.trim() : '';
    if(!id) return window.showToast('يرجى إدخال الكود', 'warning');
    input.value = '';
    await handleAttendanceScan(id);
}

async function handleAttendanceScan(id) {
    if (!id || state.isPaused) return;
    state.isPaused = true;
    const date = selectedAttendanceDate;
    
    const releaseScanner = () => {
        const feedback = document.getElementById('scanFeedback');
        if(feedback) feedback.classList.add('hidden');
        state.isPaused = false;
    };

    try {
        if (date > today) {
            window.showCustomAlert("تاريخ غير صحيح", "لا يمكن تسجيل الحضور لموعد في المستقبل.");
            releaseScanner();
            return;
        }
        
        const member = state.members.find(s => s.id === id);
        if(!member) { 
            window.showToast('كود غير صحيح', 'error'); 
            playSound('error'); 
            releaseScanner(); 
            return; 
        }
        
        const statusObj = getStudentStatusForDate(member, date);
        if (statusObj.status === 'present') { 
            window.showToast('مسجل مسبقاً', 'warning'); 
            playSound('error'); 
            releaseScanner(); 
            return; 
        }
        
        const sourceAtt = (date === today) ? state.attendance : (state.dayAttForInternal || []);
        const eventRec = sourceAtt.find(r => r.studentId === "EVENT_MARKER" && r.date === date);
        const isExpectedToAttend = eventRec && (!eventRec.levels || eventRec.levels.includes('all') || eventRec.levels.includes(member.level));
        
        if (!isExpectedToAttend) {
            window.showCustomAlert("غير مفعل", `لم يتم تفعيل هذا اليوم للجنة (${stageMap[member.level]})!`);
            releaseScanner();
            return;
        }
        
        // إظهار نغمة النجاح والطبقة الخضراء فوراً
        playSound('success');
        const feedback = document.getElementById('scanFeedback');
        if(feedback) feedback.classList.remove('hidden');
        
        const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const newRecord = { date: date, studentId: id, time: timeStr };
        
        // إخفاء الطبقة الخضراء وفك تجميد الكاميرا بسرعة فائقة (خلال 0.6 ثانية فقط)
        setTimeout(() => {
            releaseScanner();
        }, 600);

        // إرسال الحفظ للسيرفر في الخلفية بدون تعطيل القارئ أو الكاميرا
        addDoc(collection(db, "attendance"), newRecord).then(() => {
            if (date !== today) {
                state.dayAttForInternal.push(newRecord);
                window.updateCounters();
            }
        }).catch((err) => {
            window.showToast("خطأ في الاتصال بالسيرفر", "error");
        });

    } catch (error) {
        window.showToast("حدث خطأ أثناء التسجيل", "error");
        playSound('error');
        releaseScanner();
    }
}

// ==========================================
// 9. Scanner Logic (بدون تشغيل تلقائي + حماية التشغيل السريع)
// ==========================================
window.startScanner = async function(elemId, mode) {
    if(state.isScannerTransitioning) return;
    if(state.isScannerRunning && state.html5QrCode) return;
    
    state.isScannerTransitioning = true;
    await requireQRScanner();
    
    state.html5QrCode = new Html5Qrcode(elemId);
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0, disableFlip: false, formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ] };
    
    try {
        await state.html5QrCode.start({ facingMode: "environment" }, config, async (decodedText) => {
            if(state.isPaused) return;
            state.isPaused = true;
            try {
                if(mode === 'attendance') await handleAttendanceScan(decodedText);
                else if(mode === 'payment') handlePaymentScan(decodedText);
                else if(mode === 'check') await handleCheckScan(decodedText);
            } catch(err) {
                state.isPaused = false;
            }
        });
        state.isScannerRunning = true;
    } catch (err) {
        window.showToast("تعذر تشغيل الكاميرا", "error");
    } finally {
        state.isScannerTransitioning = false;
    }
}

window.stopScanner = async function() {
    if(state.isScannerTransitioning) return;
    if(state.html5QrCode) {
        state.isScannerTransitioning = true;
        try {
            await state.html5QrCode.stop();
            state.html5QrCode.clear();
        } catch(e) {}
        state.html5QrCode = null;
        state.isScannerRunning = false;
        state.isPaused = false;
        state.isScannerTransitioning = false;
    }
}

window.startCheckScanner = function() {
    document.getElementById('checkReader').classList.remove('hidden');
    document.getElementById('btnStartCheck').classList.add('hidden');
    document.getElementById('btnStopCheck').classList.remove('hidden');
    window.startScanner('checkReader', 'check');
}

window.stopCheckScanner = function() {
    window.stopScanner();
    document.getElementById('checkReader').classList.add('hidden');
    document.getElementById('btnStartCheck').classList.remove('hidden');
    document.getElementById('btnStopCheck').classList.add('hidden');
}

async function handleCheckScan(id) {
    state.isPaused = true;
    try {
        if(state.html5QrCode) state.html5QrCode.pause();
        const member = state.members.find(s => s.id === id);

        if(member) {
            document.getElementById('checkResName').innerText = member.name;
            document.getElementById('checkResCode').innerText = member.id;
            document.getElementById('checkResLevel').innerText = stageMap[member.level] || member.level;
            document.getElementById('checkResDate').innerText = member.date;
            document.getElementById('checkResPass').innerText = member.password || '---';
            
            const qrDiv = document.getElementById("checkResultQr");
            if(qrDiv) {
                qrDiv.innerHTML = '';
                new QRCode(qrDiv, { text: member.id, width: 60, height: 60 });
            }

            let memberPoints = state.accounting.filter(a => a.stdId === id);
            let memberAtt = state.attendance;

            const points = memberPoints.filter(a => a.category === 'points').sort((a,b) => new Date(b.date) - new Date(a.date));
            const totalPoints = points.reduce((sum, p) => sum + p.amount, 0);
            document.getElementById('checkResTotalPay').innerText = totalPoints + ' نقطة';
            document.getElementById('checkResPayTable').innerHTML = points.length ? points.map(p => `<tr><td>${escapeHTML(p.date)}</td><td>${escapeHTML(p.type)}</td><td class="text-blue-600 font-bold">${p.amount}</td></tr>`).join('') : '<tr><td colspan="3">لا يوجد</td></tr>';

            let presentCount = 0; let absentCount = 0; let presentRows = ''; let absentRows = '';
            const eventDates = new Set(memberAtt.map(a => a.date));

            Array.from(eventDates).forEach(d => {
                const attRec = memberAtt.find(a => a.date === d && a.studentId === id);
                const eventRec = memberAtt.find(a => a.date === d && a.studentId === "EVENT_MARKER");
                const isExpected = eventRec && (!eventRec.levels || eventRec.levels.includes('all') || eventRec.levels.includes(member.level));
                const dayAr = new Date(d + "T12:00:00").toLocaleDateString('ar-EG', {weekday: 'long'});
                if (attRec) {
                    presentCount++;
                    presentRows += `<tr><td>${escapeHTML(d)}</td><td>${escapeHTML(attRec.time || 'حاضر')}</td></tr>`;
                } else if (isExpected && d <= today) {
                    absentCount++;
                    absentRows += `<tr><td>${escapeHTML(d)}</td><td>${escapeHTML(dayAr)}</td></tr>`;
                }
            });

            document.getElementById('checkResPresentCount').innerText = presentCount;
            document.getElementById('checkResPresentTable').innerHTML = presentRows || '<tr><td colspan="2">لا يوجد</td></tr>';
            document.getElementById('checkResAbsentCount').innerText = absentCount;
            document.getElementById('checkResAbsentTable').innerHTML = absentRows || '<tr><td colspan="2">لا يوجد</td></tr>';

            document.getElementById('checkResultModal').classList.remove('hidden');
            document.body.classList.add('modal-open');
            playSound('success');
        } else {
            window.showToast('عضو غير موجود', 'error');
            if(state.html5QrCode) state.html5QrCode.resume();
            state.isPaused = false;
        }
    } catch(err) {
        window.showToast("حدث خطأ أثناء الاستعلام", "error");
        if(state.html5QrCode) state.html5QrCode.resume();
        state.isPaused = false;
    }
}

window.setAttMode = function(mode) {
    window.stopScanner().then(() => {
        const btnScan = document.getElementById('btnAttScan');
        const btnManual = document.getElementById('btnAttManual');
        if(mode === 'scan') {
            document.getElementById('attScanArea').classList.remove('hidden');
            document.getElementById('attManualArea').classList.add('hidden');
            btnScan.classList.add('active'); btnManual.classList.remove('active');
        } else {
            document.getElementById('attScanArea').classList.add('hidden');
            document.getElementById('attManualArea').classList.remove('hidden');
            btnManual.classList.add('active'); btnScan.classList.remove('active');
        }
    });
}

// ==========================================
// 10. Accounting & Payments
// ==========================================
window.togglePayMethod = function(method) {
    const btnScan = document.getElementById('btnPayScan');
    const btnManual = document.getElementById('btnPayManual');
    if(method === 'scan') {
        document.getElementById('payScanDiv').classList.remove('hidden');
        document.getElementById('payManualDiv').classList.add('hidden');
        btnScan.classList.add('active'); btnManual.classList.remove('active');
    } else {
        document.getElementById('payScanDiv').classList.add('hidden');
        document.getElementById('payManualDiv').classList.remove('hidden');
        btnManual.classList.add('active'); btnScan.classList.remove('active');
        window.stopScanner();
    }
}

function handlePaymentScan(id) {
    if(!document.getElementById('paymentForm').classList.contains('hidden')) return;
    const member = state.members.find(s => s.id === id);
    if(member) {
        state.currentPayStudent = member;
        showPaymentForm();
    } else {
        window.showToast('عضو غير موجود', 'error');
    }
}

function showPaymentForm() {
    document.getElementById('paymentForm').classList.remove('hidden');
    document.getElementById('payStdName').innerText = state.currentPayStudent.name;
    document.getElementById('payStdID').innerText = state.currentPayStudent.id;
    document.getElementById('payAmount').value = document.getElementById('defScoreAmount').value;
    document.getElementById('payType').value = document.getElementById('defScoreType').value;
    document.getElementById('payNote').value = document.getElementById('defScoreNote').value;
    playSound('success');
    state.isPaused = true;
}

window.searchStudentForPay = function() {
    handlePaymentScan(document.getElementById('paySearchID').value.trim());
}

window.confirmPayment = async function() {
    const amountVal = document.getElementById('payAmount').value;
    if(!amountVal || isNaN(amountVal) || parseFloat(amountVal) <= 0) {
        window.showToast('⚠️ يجب إدخال الدرجة/النقاط بشكل صحيح', 'error');
        return;
    }
    
    try {
        const amount = parseFloat(amountVal);
        const type = document.getElementById('payType').value;
        const note = document.getElementById('payNote').value;
        const time = new Date().toLocaleTimeString('ar-EG');
        let typeText = type;
        if(note) typeText += ` (${note})`;
        
        await addDoc(collection(db, "accounting"), {
            date: today,
            time,
            stdId: state.currentPayStudent.id,
            name: state.currentPayStudent.name,
            amount,
            type: typeText,
            category: 'points',
            timestamp: Date.now()
        });

        document.getElementById('paymentForm').classList.add('hidden');
        document.getElementById('paySearchID').value = '';
        window.showToast('تم إضافة النقاط بنجاح', 'success');
    } catch(err) {
        window.showToast('حدث خطأ أثناء حفظ التقييم', 'error');
    } finally {
        state.isPaused = false;
    }
}

window.cancelPayment = function() {
    document.getElementById('paymentForm').classList.add('hidden');
    document.getElementById('paySearchID').value = '';
    state.currentPayStudent = null;
    state.isPaused = false;
}

window.proceedWithPayment = function() {
    document.getElementById('paymentConfirmModal').style.display = 'none';
    state.isPaused = false;
    showPaymentForm();
}

window.closePaymentConfirm = function() {
    document.getElementById('paymentConfirmModal').style.display = 'none';
    state.isPaused = false;
}

window.updateFinance = function() {
    const points = state.accounting.filter(a => a.category === 'points');
    const todayPoints = points.filter(r => r.date === today);
    const totalPointsToday = todayPoints.reduce((sum, r) => sum + r.amount, 0);
    if(document.getElementById('totalRev')) document.getElementById('totalRev').innerText = totalPointsToday;
    
    const todayRevBody = document.getElementById('todayRevListBody');
    if (todayRevBody) {
        if (todayPoints.length === 0) {
            todayRevBody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-3 font-bold">لا توجد تقييمات اليوم</td></tr>';
        } else {
            todayRevBody.innerHTML = todayPoints.map(r => {
                const memberTotalPoints = points.filter(p => p.stdId === r.stdId).reduce((s, p) => s + p.amount, 0);
                return `<tr class="hover:bg-sky-50 transition"><td class="font-bold text-gray-900 leading-tight">${escapeHTML(r.name)}</td><td class="col-code font-mono text-blue-900">${escapeHTML(r.stdId)}</td><td class="font-bold text-green-700">+${r.amount} <span class="text-[9px] text-gray-500">(${escapeHTML(r.type)})</span></td><td class="font-bold text-blue-800">${memberTotalPoints} نقطة</td></tr>`;
            }).join('');
        }
    }
}

// ==========================================
// 11. Reports & Advanced Search
// ==========================================
window.toggleStudentReportSearch = function() {
    const btn = document.getElementById('btnSearchStudentReport');
    const input = document.getElementById('reportStudentSearch');
    const resDiv = document.getElementById('studentReportResult');
    
    if (btn.innerText === 'بحث') {
        if (!input.value.trim()) return window.showToast('ادخل الاسم أو الكود للبحث', 'error');
        generateStudentReport();
        btn.innerText = 'إلغاء';
        btn.className = 'bg-red-600 text-white px-3 rounded font-bold text-[10px] md:text-sm transition-all shrink-0';
    } else {
        input.value = '';
        resDiv.innerHTML = '';
        resDiv.classList.add('hidden');
        btn.innerText = 'بحث';
        btn.className = 'bg-gray-800 text-white px-3 rounded font-bold text-[10px] md:text-sm transition-all shrink-0';
    }
}

function generateStudentReport() {
    const queryStr = normalizeArabic(document.getElementById('reportStudentSearch').value.toLowerCase().trim());
    const stage = document.getElementById('searchStage').value;
    let matches = state.members.filter(s => {
        const normName = normalizeArabic((s.name || '').toLowerCase());
        const firstName = normName.split(' ')[0];
        const nameMatch = (firstName === queryStr || normName === queryStr);
        const idMatch = (s.id || '').includes(queryStr);
        const stageMatch = stage === 'all' || s.level === stage;
        return (nameMatch || idMatch) && stageMatch;
    });
    
    const resDiv = document.getElementById('studentReportResult');
    if(matches.length === 0) {
        resDiv.innerHTML = '<p class="text-red-500 text-center font-bold">لم يتم العثور على نتائج</p>';
        resDiv.classList.remove('hidden');
        return;
    }
    let listHtml = `<div class="text-xs font-bold text-gray-900 mb-2">تم العثور على ${matches.length} عضو:</div><div class="max-h-40 overflow-y-auto border rounded">`;
    matches.slice(0, 10).forEach(s => {
        listHtml += `<div onclick="openAdminStudentDash('${escapeHTML(s.id)}')" class="p-2 border-b hover:bg-gray-50 cursor-pointer flex justify-between items-center"><span class="font-bold text-xs text-blue-900">${escapeHTML(s.name)}</span><span class="bg-gray-200 px-1 rounded text-gray-700 font-mono text-[9px]">${escapeHTML(s.id)} (${escapeHTML(s.level)})</span></div>`;
    });
    listHtml += `</div>`;
    resDiv.innerHTML = listHtml;
    resDiv.classList.remove('hidden');
}

window.toggleReportInputs = function() {
    const type = document.getElementById('reportType').value;
    if(type === 'daily') {
        document.getElementById('divDateInput').classList.remove('hidden');
        document.getElementById('divMonthInput').classList.add('hidden');
    } else {
        document.getElementById('divDateInput').classList.add('hidden');
        document.getElementById('divMonthInput').classList.remove('hidden');
    }
}

window.handleReportBtnClick = function() {
    const btn = document.getElementById('btnGenerateReport');
    if (btn.innerText === 'توليد التقرير') {
        generateAdvancedReport();
    } else {
        document.getElementById('reportResult').classList.add('hidden');
        document.getElementById('reportResult').innerHTML = '';
        btn.innerText = 'توليد التقرير';
        btn.className = 'w-full bg-blue-900 text-white py-1.5 rounded font-bold shadow hover:bg-blue-950 text-[10px] md:text-sm md:py-2 transition-all';
    }
}

async function generateAdvancedReport() {
    const type = document.getElementById('reportType').value;
    const stage = document.getElementById('reportStage').value;
    const dateInput = document.getElementById('reportDate').value;
    const monthInput = document.getElementById('reportMonth').value;
    
    state.currentReportData = { present: [], absent: [], points: [], combined: [] };
    state.reportCurrentPage = 1;
    let targetMembers = state.members;
    if(stage !== 'all') targetMembers = state.members.filter(s => s.level === stage);
    
    let datesArray = [];
    if(type === 'daily') {
        if(!dateInput) return window.showToast('اختر التاريخ', 'error');
        datesArray = [dateInput];
    } else {
        if(!monthInput) return window.showToast('اختر الشهر', 'error');
        const [year, month] = monthInput.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        for(let i=1; i<=daysInMonth; i++) {
            datesArray.push(`${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
        }
    }

    document.getElementById('reportResult').innerHTML = '<div class="text-center py-4 font-bold text-blue-900">جاري معالجة البيانات...</div>';
    document.getElementById('reportResult').classList.remove('hidden');

    let periodAttendance = []; let periodAccounting = [];
    try {
        if (type === 'daily') {
            const attQ = query(collection(db, "attendance"), where("date", "==", dateInput));
            const accQ = query(collection(db, "accounting"), where("date", "==", dateInput));
            const [attSnap, accSnap] = await Promise.all([getDocs(attQ), getDocs(accQ)]);
            attSnap.forEach(doc => periodAttendance.push({ ...doc.data(), docId: doc.id }));
            accSnap.forEach(doc => periodAccounting.push({ ...doc.data(), docId: doc.id }));
        } else {
            const startDate = datesArray[0]; const endDate = datesArray[datesArray.length - 1];
            const attQ = query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate));
            const accQ = query(collection(db, "accounting"), where("date", ">=", startDate), where("date", "<=", endDate));
            const [attSnap, accSnap] = await Promise.all([getDocs(attQ), getDocs(accQ)]);
            attSnap.forEach(doc => periodAttendance.push({ ...doc.data(), docId: doc.id }));
            accSnap.forEach(doc => periodAccounting.push({ ...doc.data(), docId: doc.id }));
        }
    } catch(err) {
        window.showToast('حدث خطأ في جلب بيانات التقرير', 'error');
        return;
    }

    const attMap = {};
    periodAttendance.forEach(r => { attMap[`${r.date}_${r.studentId}`] = r; });
    
    let pointsForPeriod = periodAccounting.filter(a => a.category === 'points' && datesArray.includes(a.date));
    pointsForPeriod = pointsForPeriod.map(p => {
        const m = state.members.find(sm => sm.id === p.stdId);
        return { ...p, stdLevel: m ? m.level : 'غير معروف' };
    });

    targetMembers.forEach(member => {
        let presentCount = 0; let absentCount = 0; let presentDates = []; let absentDates = []; let presentTime = '-';
        datesArray.forEach(d => {
            if (d >= (member.date || '2020-01-01') && d <= today) {
                const attRec = attMap[`${d}_${member.id}`];
                const eventRec = attMap[`${d}_EVENT_MARKER`];
                const dateNoYear = d.replace(/^\d{4}-/, '');
                if (attRec) {
                    presentCount++; presentDates.push(dateNoYear);
                    if (type === 'daily') presentTime = (attRec.time || '').replace(/(:\d{2}):\d{2}/, '$1');
                } else if (eventRec && (!eventRec.levels || eventRec.levels.includes('all') || eventRec.levels.includes(member.level)) && d <= today) {
                    absentCount++; absentDates.push(dateNoYear);
                }
            }
        });
        const memberPoints = pointsForPeriod.filter(p => p.stdId === member.id).reduce((sum, p) => sum + p.amount, 0);
        const memberObj = { ...member, presentCount, absentCount, presentDates, absentDates, presentTime, totalPoints: memberPoints };
        if (presentCount > 0) state.currentReportData.present.push(memberObj);
        if (absentCount > 0) state.currentReportData.absent.push(memberObj);
        state.currentReportData.combined.push(memberObj);
    });
    state.currentReportData.points = pointsForPeriod.map(p => ({ ...p, date: (p.date || '').replace(/^\d{4}-/, ''), time: (p.time || '').replace(/(:\d{2}):\d{2}/, '$1') }));
    
    const btn = document.getElementById('btnGenerateReport');
    btn.innerText = 'إلغاء التقرير';
    btn.className = 'w-full bg-red-600 text-white py-1.5 rounded font-bold shadow hover:bg-red-700 text-[10px] md:text-sm md:py-2 transition-all';

    document.getElementById('reportResult').innerHTML = `<div class="bg-green-50 border border-green-200 p-4 rounded text-center shadow-sm"><div class="text-green-600 text-3xl mb-2">✅</div><h4 class="font-bold text-gray-800 mb-3 text-sm">تم استخراج التقرير بنجاح</h4><button onclick="openInternalReport()" class="bg-blue-900 text-white px-6 py-2 rounded font-bold shadow-lg text-xs md:text-sm">افتح التقرير</button></div>`;
}

// ==========================================
// 12. Internal Pages & Reports Rendering
// ==========================================
window.openInternalAttendance = async function(type) {
    state.currentAttType = type;
    state.attCurrentPage = 1;
    document.getElementById('intAttFilter').value = 'all';
    document.getElementById('intAttFilterDisplay').value = 'كل اللجان';
    document.getElementById('intAttSearch').value = '';
    
    const title = type === 'present' ? `قائمة الحضور` : `قائمة الغياب`;
    document.getElementById('intAttTitle').innerText = title;
    document.getElementById('intAttDate').innerText = selectedAttendanceDate;
    
    const thead = document.getElementById('intAttHead');
    thead.innerHTML = `<tr><th style="width: 7%;">م</th><th style="width: 45%;">الاسم</th><th style="width: 16%;">الكود</th><th style="width: 16%;">اللجنة</th><th style="width: 16%;">${type === 'present' ? 'وقت' : 'الحالة'}</th></tr>`;
    
    state.dayAttForInternal = state.attendance;
    if(selectedAttendanceDate !== today) {
        const attQ = query(collection(db, "attendance"), where("date", "==", selectedAttendanceDate));
        const snap = await getDocs(attQ);
        state.dayAttForInternal = [];
        snap.forEach(d => state.dayAttForInternal.push(d.data()));
    }
    window.openInternalPage('internalAttendancePage');
    window.applyInternalAttFilter();
}

window.applyInternalAttFilter = function() {
    const selectedLevel = document.getElementById('intAttFilter').value;
    const searchQuery = normalizeArabic(document.getElementById('intAttSearch').value.toLowerCase().trim());
    
    let targetMembers = state.members.filter(s => s.date <= selectedAttendanceDate);
    if(selectedLevel !== 'all') targetMembers = targetMembers.filter(s => s.level === selectedLevel);
    if(searchQuery !== '') targetMembers = targetMembers.filter(s => normalizeArabic((s.name||'').toLowerCase()).includes(searchQuery) || (s.id||'').includes(searchQuery));
    
    state.attCachedList = [];
    targetMembers.forEach(member => {
        const attRec = state.dayAttForInternal.find(r => r.date === selectedAttendanceDate && r.studentId === member.id);
        const eventRec = state.dayAttForInternal.find(r => r.studentId === "EVENT_MARKER" && r.date === selectedAttendanceDate);
        const isExpected = eventRec && (!eventRec.levels || eventRec.levels.includes('all') || eventRec.levels.includes(member.level));
        
        if (state.currentAttType === 'present' && attRec) {
            state.attCachedList.push({ ...member, time: (attRec.time || '').replace(/(:\d{2}):\d{2}/, '$1') });
        } else if (state.currentAttType === 'absent' && !attRec && isExpected) {
            state.attCachedList.push({ ...member, time: 'غياب' });
        }
    });

    // تطبيق الترتيب الأبجدي + أولوية البحث في الحضور والغياب
    state.attCachedList.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        if (searchQuery !== '') {
            const normA = normalizeArabic(nameA.toLowerCase().trim());
            const normB = normalizeArabic(nameB.toLowerCase().trim());
            const startsA = normA.startsWith(searchQuery);
            const startsB = normB.startsWith(searchQuery);
            if (startsA && !startsB) return -1;
            if (!startsA && startsB) return 1;
        }
        return nameA.localeCompare(nameB, 'ar', { sensitivity: 'base' });
    });

    state.attCurrentPage = 1;
    renderInternalAttendanceList();
}

function renderInternalAttendanceList(isScroll = false) {
    if (!isScroll) state.attCurrentPage = 1;

    const tbody = document.getElementById('intAttBody');
    const itemsPerScroll = 30; 
    const start = (state.attCurrentPage - 1) * itemsPerScroll;
    const end = start + itemsPerScroll;
    const pageItems = state.attCachedList.slice(start, end);
    
    if(state.attCachedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-4 font-bold text-xs">لا توجد بيانات</td></tr>`;
        return;
    }
    
    let html = pageItems.map((s, index) => `<tr class="cursor-pointer hover:bg-blue-50 transition" onclick="openAdminStudentDash('${escapeHTML(s.id)}')"><td>${start + index + 1}</td><td class="font-bold text-right pr-1 whitespace-normal leading-tight">${escapeHTML(s.name)}</td><td class="font-mono text-blue-600">${escapeHTML(s.id)}</td><td class="font-bold text-gray-700">${escapeHTML(s.level)}</td><td class="font-bold ${state.currentAttType === 'present' ? 'text-green-600' : 'text-red-600'}">${escapeHTML(s.time)}</td></tr>`).join('');
    
    if (state.attCurrentPage === 1) {
        tbody.innerHTML = html;
    } else {
        tbody.insertAdjacentHTML('beforeend', html);
    }

    // خاصية الملء التلقائي للتابلت والشاشات الكبيرة
    setTimeout(() => {
        const container = document.getElementById('internalAttendancePage');
        if (container && container.scrollHeight <= container.clientHeight + 50) {
            const totalPages = Math.ceil(state.attCachedList.length / 30) || 1;
            if (state.attCurrentPage < totalPages) {
                state.attCurrentPage++;
                renderInternalAttendanceList(true); // تحضير الـ 30 التاليين فوراً
            }
        }
    }, 150);
}

window.openInternalReport = function() {
    const category = document.getElementById('reportCategory').value;
    state.currentReportCategory = category;
    state.reportCurrentPage = 1;
    
    const outsideStage = document.getElementById('reportStage').value;
    const outsideStageDisplay = document.getElementById('reportStageDisplay').value;
    
    document.getElementById('intRepFilter').value = outsideStage || 'all';
    document.getElementById('intRepFilterDisplay').value = outsideStageDisplay || 'كل اللجان';
    document.getElementById('intRepSearch').value = '';
    
    const titleEl = document.getElementById('intRepTitle');
    if (titleEl) {
        titleEl.innerText = getReportTitleHeader(category === 'combined' ? 'تقرير شامل' : (category === 'attendance' ? 'تقرير حضور وغياب' : 'تقرير نقاط وتقييمات'));
        titleEl.style.fontSize = "11px"; // تصغير عنوان الصفحة
    }
    document.getElementById('intRepDate').innerText = document.getElementById('reportType').value === 'daily' ? document.getElementById('reportDate').value : document.getElementById('reportMonth').value;
    
    const thead = document.getElementById('intRepHead');
    const isDaily = document.getElementById('reportType').value === 'daily';

    if (category === 'combined') {
        thead.innerHTML = `<tr><th style="width: 5%;">م</th><th style="width: 26%;">الاسم</th><th style="width: 11%;">اللجنة</th><th style="width: 12%;">النقاط</th>${isDaily ? `<th style="width: 22%;">الحالة</th><th style="width: 24%;">وقت</th>` : `<th style="width: 8%;">حضور</th><th style="width: 8%;">غياب</th><th style="width: 15%;">تواريخ<br>الحضور</th><th style="width: 15%;">تواريخ<br>الغياب</th>`}</tr>`;
        document.getElementById('intRepBtnExcel').onclick = window.exportCombinedExcel;
        document.getElementById('intRepBtnPdf').onclick = window.pdfCombinedReport;
        document.getElementById('intRepBtnPrint').onclick = window.printCombinedReport;
    } else if (category === 'attendance') {
        thead.innerHTML = `<tr><th style="width: 5%;">م</th><th style="width: 29%;">الاسم</th><th style="width: 12%;">اللجنة</th>${isDaily ? `<th style="width: 26%;">الحالة</th><th style="width: 28%;">وقت</th>` : `<th style="width: 9%;">حضور</th><th style="width: 8%;">غياب</th><th style="width: 18.5%;">تواريخ<br>الحضور</th><th style="width: 18.5%;">تواريخ<br>الغياب</th>`}</tr>`;
        document.getElementById('intRepBtnExcel').onclick = window.exportAttendanceReportExcel;
        document.getElementById('intRepBtnPdf').onclick = window.pdfAttendanceReport;
        document.getElementById('intRepBtnPrint').onclick = window.printAttendanceReport;
    } else {
        thead.innerHTML = `<tr><th style="width: 6%;">م</th><th style="width: 14%;">الكود</th><th style="width: 32%;">الاسم</th><th style="width: 20%;">المهمة</th><th style="width: 14%;">النقاط</th><th style="width: 14%;">التاريخ</th></tr>`;
        document.getElementById('intRepBtnExcel').onclick = window.exportPointsReportExcel;
        document.getElementById('intRepBtnPdf').onclick = window.pdfPointsReport;
        document.getElementById('intRepBtnPrint').onclick = window.printPointsReport;
    }
    window.openInternalPage('internalReportPage');
    window.renderInternalReportList();
}

window.renderInternalReportList = function(isScroll = false) {
    if (!isScroll) state.reportCurrentPage = 1;

    const tbody = document.getElementById('intRepBody');
    const isDaily = document.getElementById('reportType').value === 'daily';
    let list = state.currentReportCategory === 'points' ? state.currentReportData.points : state.currentReportData.combined;
    
    const searchQuery = document.getElementById('intRepSearch').value.toLowerCase().trim();
    const filterStage = document.getElementById('intRepFilter').value;
    
    if(searchQuery) list = list.filter(item => (item.name||'').toLowerCase().includes(searchQuery) || (item.id && item.id.includes(searchQuery)) || (item.stdId && item.stdId.includes(searchQuery)));
    if(filterStage !== 'all') list = list.filter(item => item.level === filterStage || item.stdLevel === filterStage);

    const itemsPerScroll = 30; 
    const start = (state.reportCurrentPage - 1) * itemsPerScroll;
    const end = start + itemsPerScroll;
    const pageItems = list.slice(start, end);
    
    if(!pageItems || pageItems.length === 0) {
        if (state.reportCurrentPage === 1) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4 font-bold text-xs">لا توجد بيانات</td></tr>`;
        }
        return;
    }

    let html = '';
    if (state.currentReportCategory === 'combined') {
        html = pageItems.map((c, i) => `<tr><td>${start + i + 1}</td><td class="font-bold text-gray-900 text-right pr-1 whitespace-normal leading-tight">${escapeHTML(c.name)}</td><td class="font-bold text-blue-900">${escapeHTML(c.level)}</td><td class="text-blue-700 font-bold">${c.totalPoints}</td>${isDaily ? `<td class="font-bold ${c.presentCount > 0 ? 'text-green-600' : 'text-red-600'}">${c.presentCount > 0 ? 'حاضر' : 'غائب'}</td><td class="text-gray-600 font-mono">${c.presentCount > 0 ? (c.presentTime || '-') : '-'}</td>` : `<td class="text-green-600 font-bold">${c.presentCount}</td><td class="text-red-600 font-bold">${c.absentCount}</td><td class="text-green-700 leading-tight">${c.presentDates.join(' ، ') || '-'}</td><td class="text-red-700 leading-tight">${c.absentDates.join(' ، ') || '-'}</td>`}</tr>`).join('');
    } else if (state.currentReportCategory === 'attendance') {
        html = pageItems.map((c, i) => `<tr><td>${start + i + 1}</td><td class="font-bold text-gray-900 text-right pr-1 whitespace-normal leading-tight">${escapeHTML(c.name)}</td><td class="font-bold text-blue-900">${escapeHTML(c.level)}</td>${isDaily ? `<td class="font-bold ${c.presentCount > 0 ? 'text-green-600' : 'text-red-600'}">${c.presentCount > 0 ? 'حاضر' : 'غائب'}</td><td class="text-gray-600 font-mono">${c.presentCount > 0 ? (c.presentTime || '-') : '-'}</td>` : `<td class="text-green-600 font-bold">${c.presentCount}</td><td class="text-red-600 font-bold">${c.absentCount}</td><td class="text-green-700 leading-tight">${c.presentDates.join(' ، ') || '-'}</td><td class="text-red-700 leading-tight">${c.absentDates.join(' ، ') || '-'}</td>`}</tr>`).join('');
    } else {
        html = pageItems.map((p, i) => `<tr><td>${start + i + 1}</td><td class="font-mono text-gray-600">${escapeHTML(p.stdId)}</td><td class="font-bold text-gray-900 text-right pr-1 whitespace-normal leading-tight">${escapeHTML(p.name)}</td><td>${escapeHTML(p.type)}</td><td class="font-bold text-blue-700">${p.amount}</td><td class="font-mono text-gray-500">${escapeHTML(p.date)}</td></tr>`).join('');
    }
    
    if (state.reportCurrentPage === 1) {
        tbody.innerHTML = html;
    } else {
        tbody.insertAdjacentHTML('beforeend', html);
    }

    // خاصية الملء التلقائي للتابلت والشاشات الكبيرة
    setTimeout(() => {
        const container = document.getElementById('internalReportPage');
        if (container && container.scrollHeight <= container.clientHeight + 50) {
            const totalPages = Math.ceil(list.length / 30) || 1;
            if (state.reportCurrentPage < totalPages) {
                state.reportCurrentPage++;
                window.renderInternalReportList(true); // تحضير الـ 30 التاليين فوراً
            }
        }
    }, 150);
}

window.openAdminStudentDash = async function(studentId) {
    const member = state.members.find(s => s.id === studentId);
    if (!member) return;
    
    document.getElementById('intDashName').innerText = member.name;
    document.getElementById('intDashCode').innerText = member.id;
    document.getElementById('intDashLevel').innerText = stageMap[member.level] || member.level;
    document.getElementById('intDashJoinDate').innerText = member.date;
    
    const join = new Date(member.date);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - join) / (1000 * 60 * 60 * 24));
    document.getElementById('intDashDuration').innerText = `${diffDays} يوم`;
    
    await requireQRScanner();
    const qrDiv = document.getElementById('intDashQr');
    if(qrDiv) {
        qrDiv.innerHTML = '';
        new QRCode(qrDiv, { text: member.id, width: 80, height: 80 });
    }
    
    document.getElementById('intDashOwnPhone').innerText = member.ownPhone || member.phone || 'غير مسجل';
    document.getElementById('intDashPassword').innerText = member.password || '---';

    let sAtt = []; let sAcc = [];
    try {
        const attQ = query(collection(db, "attendance"), where("studentId", "in", [studentId, "EVENT_MARKER"]));
        const accQ = query(collection(db, "accounting"), where("stdId", "==", studentId));
        const [attSnap, accSnap] = await Promise.all([getDocs(attQ), getDocs(accQ)]);
        attSnap.forEach(d => sAtt.push(d.data()));
        accSnap.forEach(d => sAcc.push(d.data()));
    } catch(e) {
        sAtt = state.attendance; sAcc = state.accounting;
    }
    
    const stats = calculateStudentStats(member, sAtt);
    document.getElementById('intDashPresent').innerText = stats.present;
    document.getElementById('intDashAbsent').innerText = stats.absent;
    
    const points = sAcc.filter(r => r.category === 'points' && r.stdId === member.id);
    const totalPoints = points.reduce((sum, p) => sum + p.amount, 0);
    document.getElementById('intDashPaymentsTotal').innerText = `${totalPoints} نقطة`;
    
    const payTable = document.getElementById('intDashPaymentsTable');
    if(points.length > 0) {
        payTable.innerHTML = points.map(p => `<tr><td>${escapeHTML(p.date)}</td><td>${escapeHTML(p.type)}</td><td class="text-blue-600 font-bold">${p.amount}</td></tr>`).join('');
    } else {
        payTable.innerHTML = '<tr><td colspan="3" class="text-center text-gray-400">لا توجد نقاط</td></tr>';
    }
    
    const historyHtml = stats.history.map(h => `<div class="flex justify-between border-b p-2 ${h.status === 'absent' ? 'bg-red-50' : 'bg-green-50'}"><span>${escapeHTML(h.date)} (${escapeHTML(h.day)})</span><span class="font-bold ${h.status === 'absent' ? 'text-red-600' : 'text-green-600'}">${h.status === 'absent' ? 'غياب' : 'حضور'}</span></div>`).join('');
    document.getElementById('intDashHistory').innerHTML = historyHtml || '<p class="text-center text-gray-400 text-xs">لا يوجد سجل</p>';
    
    window.openInternalPage('internalStudentDashPage');
}

function calculateStudentStats(member, customAttArray = state.attendance) {
    let present = 0; let absent = 0; let history = [];
    const joinDateStr = member.date || '2020-01-01';
    
    const memberAtt = customAttArray.filter(r => (r.date >= joinDateStr && r.date <= today) && (r.studentId === member.id || (r.studentId === "EVENT_MARKER" && (!r.levels || r.levels.includes('all') || r.levels.includes(member.level)))));
    const relevantDates = [...new Set(memberAtt.map(a => a.date))];
    
    relevantDates.forEach(dateStr => {
        const attRec = memberAtt.find(a => a.date === dateStr && a.studentId === member.id);
        const eventRec = memberAtt.find(a => a.date === dateStr && a.studentId === "EVENT_MARKER");
        let status = 'none'; let time = null;
        if (attRec) {
            status = 'present'; time = attRec.time; present++;
        } else if (eventRec && dateStr <= today) {
            status = 'absent'; absent++;
        }
        if (status !== 'none') {
            const dayAr = new Date(dateStr + "T12:00:00").toLocaleDateString('ar-EG', {weekday: 'long'});
            history.push({ date: dateStr, day: dayAr, status, time });
        }
    });
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    return { present, absent, history };
}

function loadStudentDashboard(member) {
    if(!member || localStorage.getItem('loginMode') === 'admin') return;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('studentDashboard').classList.add('active');
    updateStudentDashboardData(member);
}

async function updateStudentDashboardData(member) {
    if(!member) return;
    document.getElementById('dashName').innerText = member.name;
    document.getElementById('dashCode').innerText = member.id;
    document.getElementById('dashLevel').innerText = stageMap[member.level] || member.level;
    document.getElementById('dashJoinDate').innerText = member.date;
    
    const join = new Date(member.date);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - join) / (1000 * 60 * 60 * 24));
    document.getElementById('dashDuration').innerText = `${diffDays} يوم`;

    await requireQRScanner();
    const qrDiv = document.getElementById("dashQr");
    if(qrDiv) {
        qrDiv.innerHTML = '';
        new QRCode(qrDiv, { text: member.id, width: 80, height: 80 });
    }
    
    const stats = calculateStudentStats(member, state.attendance);
    document.getElementById('dashPresent').innerText = stats.present;
    document.getElementById('dashAbsent').innerText = stats.absent;
    
    const points = state.accounting.filter(r => r.category === 'points' && r.stdId === member.id);
    const totalPoints = points.reduce((sum, p) => sum + p.amount, 0);
    document.getElementById('dashPaymentsTotal').innerText = `${totalPoints} نقطة`;
    document.getElementById('dashOwnPhone').innerText = member.ownPhone || member.phone || 'غير مسجل';

    const payTable = document.getElementById('dashPaymentsTable');
    if(payTable) {
        payTable.innerHTML = points.length > 0 
            ? points.map(p => `<tr><td>${escapeHTML(p.date)}</td><td>${escapeHTML(p.type)}</td><td class="text-blue-600 font-bold">${p.amount}</td></tr>`).join('')
            : '<tr><td colspan="3" class="text-center text-gray-400">لا توجد نقاط</td></tr>';
    }

    const historyHtml = stats.history.map(h => `<div class="flex justify-between border-b p-2 ${h.status === 'absent' ? 'bg-red-50' : 'bg-green-50'}"><span>${escapeHTML(h.date)} (${escapeHTML(h.day)})</span><span class="font-bold ${h.status === 'absent' ? 'text-red-600' : 'text-green-600'}">${h.status === 'absent' ? 'غياب' : 'حضور'}</span></div>`).join('');
    if(document.getElementById('dashHistory')) document.getElementById('dashHistory').innerHTML = historyHtml || '<p class="text-center text-gray-400 text-xs">لا يوجد سجل</p>';
}

// ==========================================
// 13. Printing & PDF System
// ==========================================
function getReportTitleHeader(baseTitle) {
    const type = document.getElementById('reportType').value;
    const stage = document.getElementById('reportStage').value;
    const dateInput = document.getElementById('reportDate').value;
    const monthInput = document.getElementById('reportMonth').value;
    let periodText = type === 'daily' ? `يوم (${dateInput || today})` : `شهر (${monthInput || today.substring(0,7)})`;
    return `${baseTitle} - ${periodText} - ${stageMap[stage] || 'كل اللجان'}`;
}

function getPrintTemplate(title, content) {
    const todayPrintDate = new Date().toLocaleDateString('ar-EG');
    return `
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box !important; font-family: 'Cairo', sans-serif !important; direction: rtl !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; background: #ffffff !important; overflow: visible !important; }
        .print-page { padding: 2px; width: 100% !important; max-width: 100% !important; }
        .print-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 4px; margin-bottom: 6px; }
        .print-meta-area { text-align: right; font-size: 9pt; color: #4b5563; font-weight: 700; }
        .print-title-area { text-align: center; flex: 1; padding: 0 5px; }
        .print-title-area h1 { font-size: 15pt; font-weight: 900; margin: 0; color: #1e3a8a; }
        .print-title-area h2 { font-size: 11pt; font-weight: 800; margin: 2px 0 0 0; color: #dc2626; }
        .print-logo-area img { width: 38px; height: 38px; object-fit: contain; }
        
        /* تكبير الخطوط في كامل الطباعات ليكون الخط واكتمال القراءة بوضوح بارز */
        table { width: 100% !important; max-width: 100% !important; border-collapse: collapse !important; margin-top: 5px !important; table-layout: fixed !important; page-break-inside: auto !important; }
        tr { page-break-inside: avoid !important; page-break-after: auto !important; }
        thead { display: table-header-group !important; }
        tfoot { display: table-footer-group !important; }
        th { background-color: #1e3a8a !important; color: #ffffff !important; font-weight: 900 !important; border: 1px solid #1e3a8a !important; padding: 6px 2px !important; text-align: center !important; font-size: 12.5px !important; word-wrap: break-word !important; overflow-wrap: break-word !important; }
        td { border: 1px solid #d1d5db !important; padding: 5px 2px !important; font-size: 11.5px !important; font-weight: 700 !important; text-align: center !important; vertical-align: middle !important; word-wrap: break-word !important; overflow-wrap: break-word !important; line-height: 1.4 !important; }
        
        .print-student-card { border: 4px double #1e3a8a !important; border-radius: 15px; padding: 15px; width: 320px; margin: 10px auto; text-align: center; page-break-inside: avoid; background: #fff; }
        .print-card-title { font-size: 14pt; font-weight: bold; margin-bottom: 8px; color: #dc2626; }
        .print-card-name { font-size: 17pt; font-weight: 900; margin: 8px 0; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; color: #000; }
        .print-card-row { font-size: 11pt; font-weight: bold; margin: 4px 0; display: flex; justify-content: space-between; border-bottom: 1px dashed #ccc; padding: 2px 0; }
    </style>
    <div class="print-page">
        <div class="print-header">
            <div class="print-meta-area"><div>تاريخ الطباعة: ${todayPrintDate}</div><div>YLY System</div></div>
            <div class="print-title-area"><h1>YLY Leaders</h1><h2>${escapeHTML(title)}</h2></div>
            <div class="print-logo-area"><img src="https://res.cloudinary.com/dsxrjmcxs/image/upload/c_limit,w_400,q_auto,f_auto/v1784657850/s60xlqx1otmwcijtjw1l.png"></div>
        </div>
        <div class="print-body">${content}</div>
    </div>`;
}

window.printHTML = async function(title, content) {
    if (state.isPrinting) return;
    state.isPrinting = true;
    window.showToast('جاري تحضير الطباعة...', 'success');
    
    try {
        let printIframe = document.getElementById('silent-print-iframe');
        if (!printIframe) {
            printIframe = document.createElement('iframe');
            printIframe.id = 'silent-print-iframe';
            printIframe.style.cssText = 'position: fixed; right: -9999px; bottom: -9999px; width: 0; height: 0; border: none;';
            document.body.appendChild(printIframe);
        }
        
        const iframeDoc = printIframe.contentWindow.document;
        iframeDoc.open();
        // إجبار A4 portrait عمودي دائماً لجميع التقارير
        iframeDoc.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><title>${escapeHTML(title)}</title><style>@page { size: A4 portrait !important; margin: 4mm !important; }</style></head><body>${getPrintTemplate(title, content)}</body></html>`);
        iframeDoc.close();
        
        setTimeout(() => {
            printIframe.contentWindow.focus();
            printIframe.contentWindow.print();
            state.isPrinting = false;
        }, 500);
    } catch (e) {
        window.showToast('حدث خطأ أثناء الطباعة', 'error');
        state.isPrinting = false;
    }
};

window.savePDF = async function(title, content, isLandscape = false) {
    window.showToast('جاري تجهيز ملف PDF، يرجى الانتظار...', 'success');
    await requireHtml2Pdf();
    
    // إنشاء حاوية مخفية تماماً خارج الشاشة لعدم التأثير على واجهة المستخدم
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-99999px';
    tempDiv.style.top = '-99999px';
    // تحديد عرض ثابت يحاكي ورقة A4 لضمان عدم ضغط العناصر
    tempDiv.style.width = isLandscape ? '1122px' : '800px'; 
    tempDiv.style.backgroundColor = '#ffffff';
    tempDiv.innerHTML = getPrintTemplate(title, content);
    document.body.appendChild(tempDiv);

    const opt = {
        margin:       [5, 5, 5, 5],
        filename:     `${title.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 1 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: isLandscape ? 'landscape' : 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'] } // يحترم كود page-break-inside: avoid الموجود في الـ CSS الخاص بك
    };

    try {
        await html2pdf().set(opt).from(tempDiv).save();
        window.showToast('تم تحميل ملف PDF بنجاح', 'success');
    } catch (err) {
        window.showToast('حدث خطأ أثناء استخراج PDF', 'error');
    } finally {
        document.body.removeChild(tempDiv);
    }
};

window.printContent = function(elementId, title) {
    const content = `<table class="ultra-compact-table"><thead>${document.getElementById('intAttHead').innerHTML}</thead><tbody>${document.getElementById('intAttBody').innerHTML}</tbody></table>`;
    window.printHTML(title, content);
}

window.pdfContent = function(elementId, title) {
    const content = `<table class="ultra-compact-table"><thead>${document.getElementById('intAttHead').innerHTML}</thead><tbody>${document.getElementById('intAttBody').innerHTML}</tbody></table>`;
    window.savePDF(title, content);
}

window.printStudentCard = async function() {
    const s = state.members.find(st => st.id === state.currentModalStudentId);
    if(!s) return;
    window.showToast('جاري تجهيز الكارنيه...', 'success');
    const qrImageHtml = await generateQRBase64(s.id);
    const stdPhone = s.ownPhone || s.phone || 'غير مسجل';
    const content = `
        <div class="print-student-card">
            <div class="print-card-title">بطاقة عضو YLY</div>
            <div class="print-card-name">${escapeHTML(s.name)}</div>
            <div style="display:flex; justify-content:center; margin:10px 0;">${qrImageHtml}</div>
            <div class="print-card-row"><span>كود العضو:</span> <span>${escapeHTML(s.id)}</span></div>
            <div class="print-card-row"><span>كلمة السر:</span> <span>${escapeHTML(s.password || '----')}</span></div>
            <div class="print-card-row"><span>اللجنة:</span> <span>${escapeHTML(stageMap[s.level] || s.level)}</span></div>
            <div class="print-card-row"><span>رقم الهاتف:</span> <span>${escapeHTML(stdPhone)}</span></div>
            <div class="print-card-row"><span>تاريخ الانضمام:</span> <span>${escapeHTML(s.date)}</span></div>
        </div>`;
    window.printHTML('بطاقة عضو', content);
}

window.shareStudentPdf = async function() { 
    const s = state.members.find(st => st.id === state.currentModalStudentId);
    if(!s) return;
    const qrImageHtml = await generateQRBase64(s.id);
    const stdPhone = s.ownPhone || s.phone || 'غير مسجل';
    const content = `
        <div class="print-student-card">
            <div class="print-card-title">بطاقة عضو YLY</div>
            <div class="print-card-name">${escapeHTML(s.name)}</div>
            <div style="display:flex; justify-content:center; margin:10px 0;">${qrImageHtml}</div>
            <div class="print-card-row"><span>كود العضو:</span> <span>${escapeHTML(s.id)}</span></div>
            <div class="print-card-row"><span>كلمة السر:</span> <span>${escapeHTML(s.password || '----')}</span></div>
            <div class="print-card-row"><span>اللجنة:</span> <span>${escapeHTML(stageMap[s.level] || s.level)}</span></div>
            <div class="print-card-row"><span>رقم الهاتف:</span> <span>${escapeHTML(stdPhone)}</span></div>
            <div class="print-card-row"><span>تاريخ الانضمام:</span> <span>${escapeHTML(s.date)}</span></div>
        </div>`;
    window.savePDF(`بطاقة_عضو_${s.name}`, content);
}

async function buildFullStudentReportHTML(member, sAtt, sAcc) {
    const qrImageHtml = await generateQRBase64(member.id);
    const stats = calculateStudentStats(member, sAtt);
    const points = sAcc.filter(r => r.category === 'points' && r.stdId === member.id);
    const totalPoints = points.reduce((sum, p) => sum + p.amount, 0);

    const pointsRows = points.length > 0 
        ? points.map(p => `<tr><td>${escapeHTML(p.date)}</td><td>${escapeHTML(p.type)}</td><td style="color:#1e3a8a; font-weight:bold;">${p.amount}</td></tr>`).join('')
        : '<tr><td colspan="3">لا توجد نقاط</td></tr>';

    // فصل التاريخ واليوم بجدول الحضور
    const historyRows = stats.history.length > 0
        ? stats.history.map(h => `<tr><td>${escapeHTML(h.date)}</td><td>${escapeHTML(h.day)}</td><td style="font-weight:bold; color:${h.status === 'absent' ? 'red' : 'green'};">${h.status === 'absent' ? 'غياب' : 'حضور'}</td></tr>`).join('')
        : '<tr><td colspan="3">لا يوجد سجل</td></tr>';

    return `
        <div class="print-student-card">
            <div class="print-card-title">بطاقة عضو YLY</div>
            <div class="print-card-name">${escapeHTML(member.name)}</div>
            <div style="display:flex; justify-content:center; margin:10px 0;">${qrImageHtml}</div>
            <div class="print-card-row"><span>كود العضو:</span> <span>${escapeHTML(member.id)}</span></div>
            <div class="print-card-row"><span>اللجنة:</span> <span>${escapeHTML(stageMap[member.level] || member.level)}</span></div>
            <div class="print-card-row"><span>تاريخ الانضمام:</span> <span>${escapeHTML(member.date)}</span></div>
        </div>
        <table style="width:100%; margin-bottom:15px; border-collapse:separate; border-spacing:8px 0;">
            <tr>
                <td style="border:1px solid #1e3a8a; padding:8px; text-align:center; border-radius:8px; width:33%;">
                    <div style="font-size:10pt; font-weight:bold; border-bottom:1px solid #ccc; padding-bottom:4px; margin-bottom:4px;">أيام الحضور</div>
                    <div style="font-size:14pt; font-weight:900; color:green;">${stats.present}</div>
                </td>
                <td style="border:1px solid #1e3a8a; padding:8px; text-align:center; border-radius:8px; width:33%;">
                    <div style="font-size:10pt; font-weight:bold; border-bottom:1px solid #ccc; padding-bottom:4px; margin-bottom:4px;">أيام الغياب</div>
                    <div style="font-size:14pt; font-weight:900; color:red;">${stats.absent}</div>
                </td>
                <td style="border:1px solid #1e3a8a; padding:8px; text-align:center; border-radius:8px; width:33%;">
                    <div style="font-size:10pt; font-weight:bold; border-bottom:1px solid #ccc; padding-bottom:4px; margin-bottom:4px;">إجمالي النقاط</div>
                    <div style="font-size:14pt; font-weight:900; color:#1e3a8a;">${totalPoints}</div>
                </td>
            </tr>
        </table>
        <h3 style="border-bottom:2px solid #1e3a8a; margin-top:20px; color:#1e3a8a; font-size:12pt; font-weight:bold;">سجل النقاط والمهام</h3>
        <table class="ultra-compact-table">
            <thead><tr><th style="width:30%;">التاريخ</th><th style="width:50%;">المهمة/التقييم</th><th style="width:20%;">النقاط</th></tr></thead>
            <tbody>${pointsRows}</tbody>
        </table>
        <h3 style="border-bottom:2px solid #1e3a8a; margin-top:20px; color:#1e3a8a; font-size:12pt; font-weight:bold;">سجل الحضور والغياب</h3>
        <table class="ultra-compact-table">
            <thead><tr><th style="width:40%;">التاريخ</th><th style="width:35%;">اليوم</th><th style="width:25%;">الحالة</th></tr></thead>
            <tbody>${historyRows}</tbody>
        </table>
    `;
}

window.printStudentDashboard = async function() {
    const code = document.getElementById('dashCode').innerText;
    const s = state.members.find(st => st.id === code);
    if(!s) return;
    const content = await buildFullStudentReportHTML(s, state.attendance, state.accounting);
    window.printHTML(`تقرير_متابعة_${s.name}`, content);
}

window.pdfStudentDashboard = async function() { 
    const code = document.getElementById('dashCode').innerText;
    const s = state.members.find(st => st.id === code);
    if(!s) return;
    const content = await buildFullStudentReportHTML(s, state.attendance, state.accounting);
    window.savePDF(`تقرير_متابعة_${s.name}`, content);
}

window.printInternalStudentDash = async function() {
    const code = document.getElementById('intDashCode').innerText;
    const s = state.members.find(st => st.id === code);
    if(!s) return;
    let sAtt = []; let sAcc = [];
    try {
        const attQ = query(collection(db, "attendance"), where("studentId", "in", [code, "EVENT_MARKER"]));
        const accQ = query(collection(db, "accounting"), where("stdId", "==", code));
        const [attSnap, accSnap] = await Promise.all([getDocs(attQ), getDocs(accQ)]);
        attSnap.forEach(d => sAtt.push(d.data()));
        accSnap.forEach(d => sAcc.push(d.data()));
    } catch(e) {
        sAtt = state.attendance; sAcc = state.accounting;
    }
    const content = await buildFullStudentReportHTML(s, sAtt, sAcc);
    window.printHTML(`تقرير_العضو_${s.name}`, content);
}

// إعادة تصميم وتنسيق إكسيل التقرير المفصل للعضو بالكامل بدون أي دمج
window.excelDetailedStudentReport = async function(code) {
    const s = state.members.find(st => st.id === code);
    if(!s) return;
    let sAtt = []; let sAcc = [];
    try {
        const attQ = query(collection(db, "attendance"), where("studentId", "in", [code, "EVENT_MARKER"]));
        const accQ = query(collection(db, "accounting"), where("stdId", "==", code));
        const [attSnap, accSnap] = await Promise.all([getDocs(attQ), getDocs(accQ)]);
        attSnap.forEach(d => sAtt.push(d.data()));
        accSnap.forEach(d => sAcc.push(d.data()));
    } catch(e) {
        sAtt = state.attendance; sAcc = state.accounting;
    }
    const stats = calculateStudentStats(s, sAtt);
    const points = sAcc.filter(r => r.category === 'points' && r.stdId === s.id);
    const totalPoints = points.reduce((sum, p) => sum + p.amount, 0);

    const reportTitle = `تقرير متابعة العضو التفصيلي - ${s.name}`;
    const headers = ["القسم", "البيان / التاريخ", "التفاصيل / المهمة / الحالة", "النقاط المكتسبة"];
    const rows = [];

    // 1. البيانات الشخصية
    rows.push(["البيانات الشخصية", "اسم العضو", s.name, "-"]);
    rows.push(["البيانات الشخصية", "كود العضو", s.id, "-"]);
    rows.push(["البيانات الشخصية", "اللجنة", stageMap[s.level] || s.level, "-"]);
    rows.push(["البيانات الشخصية", "رقم الهاتف", s.ownPhone || s.phone || 'غير مسجل', "-"]);
    rows.push(["البيانات الشخصية", "تاريخ الانضمام", s.date || '-', "-"]);

    // 2. الملخص
    rows.push(["ملخص النشاط", "أيام الحضور", `${stats.present} يوم`, "-"]);
    rows.push(["ملخص النشاط", "أيام الغياب", `${stats.absent} يوم`, "-"]);
    rows.push(["ملخص النشاط", "إجمالي النقاط", `${totalPoints} نقطة`, totalPoints]);

    // 3. سجل التقييمات
    points.forEach(p => {
        rows.push(["سجل التقييمات والنقاط", p.date, p.type, p.amount]);
    });

    // 4. سجل الحضور
    stats.history.forEach(h => {
        rows.push(["سجل الحضور والغياب", `${h.date} (${h.day})`, h.status === 'present' ? 'حضور' : 'غياب', '-']);
    });

    window.exportToExcelStyle(headers, rows, reportTitle, `تقرير_العضو_${s.name}`);
}

window.pdfDetailedStudentReport = async function(code) { 
    const s = state.members.find(st => st.id === code);
    if(!s) return;
    let sAtt = []; let sAcc = [];
    try {
        const attQ = query(collection(db, "attendance"), where("studentId", "in", [code, "EVENT_MARKER"]));
        const accQ = query(collection(db, "accounting"), where("stdId", "==", code));
        const [attSnap, accSnap] = await Promise.all([getDocs(attQ), getDocs(accQ)]);
        attSnap.forEach(d => sAtt.push(d.data()));
        accSnap.forEach(d => sAcc.push(d.data()));
    } catch(e) {
        sAtt = state.attendance; sAcc = state.accounting;
    }
    const content = await buildFullStudentReportHTML(s, sAtt, sAcc);
    window.savePDF(`تقرير_العضو_${s.name}`, content);
}

window.printStudentsList = function() {
    let rows = state.members.map((s, i) => `<tr><td style="width:30px;">${i+1}</td><td style="width:60px;">${s.id}</td><td style="font-weight:bold; width:220px;">${escapeHTML(s.name)}</td><td style="width:90px;">${escapeHTML(stageMap[s.level] || s.level)}</td><td style="width:80px;">${s.date}</td></tr>`).join('');
    const content = `<table class="ultra-compact-table"><thead><tr><th style="width: 30px;">م</th><th style="width: 60px;">الكود</th><th style="width: 220px;">الاسم</th><th style="width: 90px;">اللجنة</th><th style="width: 80px;">تاريخ الانضمام</th></tr></thead><tbody>${rows}</tbody></table>`;
    window.printHTML('قائمة الأعضاء المسجلين', content);
}

window.pdfStudentsList = function() { 
    let rows = state.members.map((s, i) => `<tr><td style="width:30px;">${i+1}</td><td style="width:60px;">${s.id}</td><td style="font-weight:bold; width:220px;">${escapeHTML(s.name)}</td><td style="width:90px;">${escapeHTML(stageMap[s.level] || s.level)}</td><td style="width:80px;">${s.date}</td></tr>`).join('');
    const content = `<table class="ultra-compact-table"><thead><tr><th style="width: 30px;">م</th><th style="width: 60px;">الكود</th><th style="width: 220px;">الاسم</th><th style="width: 90px;">اللجنة</th><th style="width: 80px;">تاريخ الانضمام</th></tr></thead><tbody>${rows}</tbody></table>`;
    window.savePDF('قائمة الأعضاء المسجلين', content);
}

window.pdfCombinedReport = function() {
    if(!state.currentReportData.combined || state.currentReportData.combined.length === 0) return window.showToast('لا توجد بيانات للطباعة', 'error');
    const title = getReportTitleHeader("التقرير الشامل");
    const isDaily = document.getElementById('reportType').value === 'daily';
    
    let rows = isDaily 
        ? state.currentReportData.combined.map((c, i) => `<tr><td>${i+1}</td><td>${c.id}</td><td style="font-weight:bold;">${escapeHTML(c.name)}</td><td>${escapeHTML(stageMap[c.level]||c.level)}</td><td style="color:blue; font-weight:bold;">${c.totalPoints}</td><td style="font-weight:bold; color:${c.presentCount > 0 ? 'green' : 'red'};">${c.presentCount > 0 ? 'حاضر' : 'غائب'}</td><td>${c.presentCount > 0 ? (c.presentTime || '-') : '-'}</td></tr>`).join('')
        : state.currentReportData.combined.map((c, i) => `<tr><td>${i+1}</td><td>${c.id}</td><td style="font-weight:bold;">${escapeHTML(c.name)}</td><td>${escapeHTML(c.level)}</td><td style="color:blue; font-weight:bold;">${c.totalPoints}</td><td style="color:green; font-weight:bold;">${c.presentCount}</td><td style="color:red; font-weight:bold;">${c.absentCount}</td><td style="color:green; font-size:9.5px; line-height:1.4;">${c.presentDates.join(' ، ') || '-'}</td><td style="color:red; font-size:9.5px; line-height:1.4;">${c.absentDates.join(' ، ') || '-'}</td></tr>`).join('');

    const content = `<table class="ultra-compact-table"><thead><tr>${isDaily 
        ? '<th style="width:5%;">م</th><th style="width:10%;">الكود</th><th style="width:38%;">الاسم</th><th style="width:11%;">اللجنة</th><th style="width:12%;">النقاط</th><th style="width:11%;">الحالة</th><th style="width:13%;">وقت الحضور</th>' 
        : '<th style="width:4%;">م</th><th style="width:8%;">الكود</th><th style="width:22%;">الاسم</th><th style="width:8%;">اللجنة</th><th style="width:7%;">النقاط</th><th style="width:5%;">حضور</th><th style="width:5%;">غياب</th><th style="width:20.5%;">تواريخ الحضور</th><th style="width:20.5%;">تواريخ الغياب</th>'}</tr></thead><tbody>${rows}</tbody></table>`;
    window.savePDF(title, content);
}

window.printCombinedReport = function() {
    if(!state.currentReportData.combined || state.currentReportData.combined.length === 0) return window.showToast('لا توجد بيانات للطباعة', 'error');
    const title = getReportTitleHeader("التقرير الشامل");
    const isDaily = document.getElementById('reportType').value === 'daily';
    
    let rows = isDaily 
        ? state.currentReportData.combined.map((c, i) => `<tr><td>${i+1}</td><td>${c.id}</td><td style="font-weight:bold;">${escapeHTML(c.name)}</td><td>${escapeHTML(stageMap[c.level]||c.level)}</td><td style="color:blue; font-weight:bold;">${c.totalPoints}</td><td style="font-weight:bold; color:${c.presentCount > 0 ? 'green' : 'red'};">${c.presentCount > 0 ? 'حاضر' : 'غائب'}</td><td>${c.presentCount > 0 ? (c.presentTime || '-') : '-'}</td></tr>`).join('')
        : state.currentReportData.combined.map((c, i) => `<tr><td>${i+1}</td><td>${c.id}</td><td style="font-weight:bold;">${escapeHTML(c.name)}</td><td>${escapeHTML(c.level)}</td><td style="color:blue; font-weight:bold;">${c.totalPoints}</td><td style="color:green; font-weight:bold;">${c.presentCount}</td><td style="color:red; font-weight:bold;">${c.absentCount}</td><td style="color:green; font-size:9.5px; line-height:1.4;">${c.presentDates.join(' ، ') || '-'}</td><td style="color:red; font-size:9.5px; line-height:1.4;">${c.absentDates.join(' ، ') || '-'}</td></tr>`).join('');

    // توزيع النسب المئوية الموزونة لتستوعب 9 أعمدة داخل الورقة العمودية 100% بالضبط
    const content = `<table class="ultra-compact-table"><thead><tr>${isDaily 
        ? '<th style="width:5%;">م</th><th style="width:10%;">الكود</th><th style="width:38%;">الاسم</th><th style="width:11%;">اللجنة</th><th style="width:12%;">النقاط</th><th style="width:11%;">الحالة</th><th style="width:13%;">وقت الحضور</th>' 
        : '<th style="width:4%;">م</th><th style="width:8%;">الكود</th><th style="width:22%;">الاسم</th><th style="width:8%;">اللجنة</th><th style="width:7%;">النقاط</th><th style="width:5%;">حضور</th><th style="width:5%;">غياب</th><th style="width:20.5%;">تواريخ الحضور</th><th style="width:20.5%;">تواريخ الغياب</th>'}</tr></thead><tbody>${rows}</tbody></table>`;
    window.printHTML(title, content);
}

window.printAttendanceReport = function() {
    if(!state.currentReportData.combined || state.currentReportData.combined.length === 0) return window.showToast('لا توجد بيانات للطباعة', 'error');
    const title = getReportTitleHeader("تقرير الحضور والغياب");
    const isDaily = document.getElementById('reportType').value === 'daily';
    
    let rows = isDaily 
        ? state.currentReportData.combined.map((c, i) => `<tr><td>${i+1}</td><td>${c.id}</td><td style="font-weight:bold;">${escapeHTML(c.name)}</td><td>${escapeHTML(stageMap[c.level]||c.level)}</td><td style="font-weight:bold; color:${c.presentCount > 0 ? 'green' : 'red'};">${c.presentCount > 0 ? 'حاضر' : 'غائب'}</td><td>${c.presentCount > 0 ? (c.presentTime || '-') : '-'}</td></tr>`).join('')
        : state.currentReportData.combined.map((c, i) => `<tr><td>${i+1}</td><td>${c.id}</td><td style="font-weight:bold;">${escapeHTML(c.name)}</td><td>${escapeHTML(stageMap[c.level]||c.level)}</td><td style="color:green; font-weight:bold;">${c.presentCount}</td><td style="color:red; font-weight:bold;">${c.absentCount}</td><td style="color:green; font-size:9.5px; line-height:1.4;">${c.presentDates.join(' ، ') || '-'}</td><td style="color:red; font-size:9.5px; line-height:1.4;">${c.absentDates.join(' ، ') || '-'}</td></tr>`).join('');

    const content = `<table class="ultra-compact-table"><thead><tr>${isDaily 
        ? '<th style="width:5%;">م</th><th style="width:12%;">الكود</th><th style="width:42%;">الاسم</th><th style="width:12%;">اللجنة</th><th style="width:14%;">الحالة</th><th style="width:15%;">وقت الحضور</th>' 
        : '<th style="width:4%;">م</th><th style="width:9%;">الكود</th><th style="width:25%;">الاسم</th><th style="width:9%;">اللجنة</th><th style="width:6%;">حضور</th><th style="width:6%;">غياب</th><th style="width:20.5%;">تواريخ الحضور</th><th style="width:20.5%;">تواريخ الغياب</th>'}</tr></thead><tbody>${rows}</tbody></table>`;
    window.printHTML(title, content);
}

window.pdfAttendanceReport = function() { 
    if(!state.currentReportData.combined || state.currentReportData.combined.length === 0) return window.showToast('لا توجد بيانات للطباعة', 'error');
    const title = getReportTitleHeader("تقرير الحضور والغياب");
    const isDaily = document.getElementById('reportType').value === 'daily';
    
    let rows = isDaily 
        ? state.currentReportData.combined.map((c, i) => `<tr><td>${i+1}</td><td>${c.id}</td><td style="font-weight:bold;">${escapeHTML(c.name)}</td><td>${escapeHTML(stageMap[c.level]||c.level)}</td><td style="font-weight:bold; color:${c.presentCount > 0 ? 'green' : 'red'};">${c.presentCount > 0 ? 'حاضر' : 'غائب'}</td><td>${c.presentCount > 0 ? (c.presentTime || '-') : '-'}</td></tr>`).join('')
        : state.currentReportData.combined.map((c, i) => `<tr><td>${i+1}</td><td>${c.id}</td><td style="font-weight:bold;">${escapeHTML(c.name)}</td><td>${escapeHTML(stageMap[c.level]||c.level)}</td><td style="color:green; font-weight:bold;">${c.presentCount}</td><td style="color:red; font-weight:bold;">${c.absentCount}</td><td style="color:green; font-size:9.5px; line-height:1.4;">${c.presentDates.join(' ، ') || '-'}</td><td style="color:red; font-size:9.5px; line-height:1.4;">${c.absentDates.join(' ، ') || '-'}</td></tr>`).join('');

    const content = `<table class="ultra-compact-table"><thead><tr>${isDaily 
        ? '<th style="width:5%;">م</th><th style="width:12%;">الكود</th><th style="width:42%;">الاسم</th><th style="width:12%;">اللجنة</th><th style="width:14%;">الحالة</th><th style="width:15%;">وقت الحضور</th>' 
        : '<th style="width:4%;">م</th><th style="width:9%;">الكود</th><th style="width:25%;">الاسم</th><th style="width:9%;">اللجنة</th><th style="width:6%;">حضور</th><th style="width:6%;">غياب</th><th style="width:20.5%;">تواريخ الحضور</th><th style="width:20.5%;">تواريخ الغياب</th>'}</tr></thead><tbody>${rows}</tbody></table>`;
    window.savePDF(title, content);
}

window.printPointsReport = function() {
    if(!state.currentReportData.points || state.currentReportData.points.length === 0) return window.showToast('لا توجد بيانات للطباعة', 'error');
    const title = getReportTitleHeader("تقرير النقاط والمهام");
    let rows = state.currentReportData.points.map((p, i) => `<tr><td>${i+1}</td><td>${p.stdId}</td><td style="font-weight:bold;">${escapeHTML(p.name)}</td><td>${escapeHTML(p.type)}</td><td style="color:blue; font-weight:bold;">${p.amount}</td><td>${p.date}</td></tr>`).join('');
    const content = `<table class="ultra-compact-table"><thead><tr><th style="width:5%;">م</th><th style="width:11%;">الكود</th><th style="width:38%;">الاسم</th><th style="width:22%;">المهمة/التقييم</th><th style="width:12%;">النقاط</th><th style="width:12%;">التاريخ</th></tr></thead><tbody>${rows}</tbody></table>`;
    window.printHTML(title, content);
}

window.pdfPointsReport = function() { 
    if(!state.currentReportData.points || state.currentReportData.points.length === 0) return window.showToast('لا توجد بيانات للطباعة', 'error');
    const title = getReportTitleHeader("تقرير النقاط والمهام");
    let rows = state.currentReportData.points.map((p, i) => `<tr><td>${i+1}</td><td>${p.stdId}</td><td style="font-weight:bold;">${escapeHTML(p.name)}</td><td>${escapeHTML(p.type)}</td><td style="color:blue; font-weight:bold;">${p.amount}</td><td>${p.date}</td></tr>`).join('');
    const content = `<table class="ultra-compact-table"><thead><tr><th style="width:5%;">م</th><th style="width:11%;">الكود</th><th style="width:38%;">الاسم</th><th style="width:22%;">المهمة/التقييم</th><th style="width:12%;">النقاط</th><th style="width:12%;">التاريخ</th></tr></thead><tbody>${rows}</tbody></table>`;
    window.savePDF(title, content);
}

// ==========================================
// 14. Full Professional Excel Engine
// ==========================================
window.exportToExcelStyle = async function(headers, rows, reportTitle, fileName) {
    await requireXLSX();
    if (typeof XLSX === 'undefined') { window.showToast('مكتبة الإكسيل غير محملة', 'error'); return; }

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };

    const wsData = [ [reportTitle], headers, ...rows ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const colCount = headers.length;

    ws['!merges'] = [ { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } } ];

    const borderStyle = {
        top: { style: "thin", color: { rgb: "D1D5DB" } },
        bottom: { style: "thin", color: { rgb: "D1D5DB" } },
        left: { style: "thin", color: { rgb: "D1D5DB" } },
        right: { style: "thin", color: { rgb: "D1D5DB" } }
    };
    const headerBorderStyle = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
    };

    if (ws['A1']) {
        ws['A1'].s = {
            font: { name: 'Cairo', sz: 15, bold: true, color: { rgb: "DC2626" } },
            alignment: { horizontal: "center", vertical: "center" },
            fill: { fgColor: { rgb: "F9FAFB" } }
        };
    }

    for (let col = 0; col < colCount; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: 1, c: col });
        if (ws[cellRef]) {
            ws[cellRef].s = {
                font: { name: 'Cairo', sz: 12, bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "1E3A8A" } },
                alignment: { horizontal: "center", vertical: "center", wrapText: true },
                border: headerBorderStyle
            };
        }
    }

    const totalRows = wsData.length;
    for (let r = 2; r < totalRows; r++) {
        for (let c = 0; c < colCount; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
            if (ws[cellRef]) {
                ws[cellRef].t = typeof ws[cellRef].v === 'number' ? 'n' : 's';
                ws[cellRef].s = {
                    font: { name: 'Cairo', sz: 11 },
                    alignment: { horizontal: "center", vertical: "center", wrapText: true },
                    border: borderStyle
                };
            }
        }
    }

    ws['!cols'] = headers.map((h, colIndex) => {
        let maxLen = h ? h.toString().length : 10;
        for (let r = 2; r < totalRows; r++) {
            const val = wsData[r][colIndex];
            if (val !== undefined && val !== null) {
                const len = val.toString().length;
                if (len > maxLen) maxLen = len;
            }
        }
        return { wch: Math.min(Math.max(maxLen + 4, 14), 40) };
    });

    ws['!rows'] = [{ hpt: 35 }, { hpt: 26 }];

    XLSX.utils.book_append_sheet(wb, ws, "التقرير");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
}

window.exportStudentsListExcel = function() {
    const filterStage = document.getElementById('studentListFilter').value;
    const queryVal = normalizeArabic(document.getElementById('searchStd').value.toLowerCase());
    let filtered = state.members;
    if(filterStage !== 'all') filtered = filtered.filter(s => s.level === filterStage);
    if(queryVal !== '') filtered = filtered.filter(s => normalizeArabic((s.name||'').toLowerCase()).includes(queryVal) || (s.id||'').includes(queryVal));

    const headers = ["م", "الكود", "الاسم", "اللجنة", "رقم الهاتف", "تاريخ الانضمام"];
    const rows = filtered.map((s, index) => [ index + 1, s.id, s.name, stageMap[s.level] || s.level, s.ownPhone || s.phone || 'غير مسجل', s.date || '-' ]);
    window.exportToExcelStyle(headers, rows, "قائمة الأعضاء المسجلين YLY", "قائمة_الأعضاء_YLY");
}

window.exportCombinedExcel = function() {
    if(!state.currentReportData.combined || state.currentReportData.combined.length === 0) return window.showToast('لا توجد بيانات للتصدير', 'error');
    const isDaily = document.getElementById('reportType').value === 'daily';
    const titleHeader = getReportTitleHeader("التقرير الشامل YLY");
    
    let headers = []; let rows = [];
    if (isDaily) {
        headers = ["م", "الكود", "الاسم", "اللجنة", "رقم الهاتف", "النقاط المكتسبة", "الحالة", "وقت الحضور"];
        rows = state.currentReportData.combined.map((c, i) => [ i + 1, c.id, c.name, c.level, c.ownPhone || c.phone || 'غير مسجل', c.totalPoints, c.presentCount > 0 ? 'حاضر' : 'غائب', c.presentCount > 0 ? (c.presentTime || '-') : '-' ]);
    } else {
        headers = ["م", "الكود", "الاسم", "اللجنة", "رقم الهاتف", "النقاط المكتسبة", "أيام الحضور", "أيام الغياب", "تواريخ الحضور", "تواريخ الغياب"];
        rows = state.currentReportData.combined.map((c, i) => [ i + 1, c.id, c.name, c.level, c.ownPhone || c.phone || 'غير مسجل', c.totalPoints, c.presentCount, c.absentCount, c.presentDates.join('\n') || 'لا يوجد', c.absentDates.join('\n') || 'لا يوجد' ]);
    }
    window.exportToExcelStyle(headers, rows, titleHeader, "تقرير_شامل_YLY");
}

window.exportAttendanceReportExcel = function() {
    if(!state.currentReportData.combined || state.currentReportData.combined.length === 0) return window.showToast('لا توجد بيانات للتصدير', 'error');
    const isDaily = document.getElementById('reportType').value === 'daily';
    const titleHeader = getReportTitleHeader("تقرير الحضور والغياب التفصيلي YLY");
    
    let headers = []; let rows = [];
    if (isDaily) {
        headers = ["م", "الكود", "الاسم", "اللجنة", "رقم الهاتف", "الحالة", "وقت الحضور"];
        rows = state.currentReportData.combined.map((c, i) => [ i + 1, c.id, c.name, c.level, c.ownPhone || c.phone || 'غير مسجل', c.presentCount > 0 ? 'حاضر' : 'غائب', c.presentCount > 0 ? (c.presentTime || '-') : '-' ]);
    } else {
        headers = ["م", "الكود", "الاسم", "اللجنة", "رقم الهاتف", "أيام الحضور", "أيام الغياب", "تواريخ الحضور التفصيلية", "تواريخ الغياب التفصيلية"];
        rows = state.currentReportData.combined.map((c, i) => [ i + 1, c.id, c.name, c.level, c.ownPhone || c.phone || 'غير مسجل', c.presentCount, c.absentCount, c.presentDates.join('\n') || 'لا يوجد', c.absentDates.join('\n') || 'لا يوجد' ]);
    }
    window.exportToExcelStyle(headers, rows, titleHeader, "تقرير_الحضور_والغياب_YLY");
}

window.exportPointsReportExcel = function() {
    if(!state.currentReportData.points || state.currentReportData.points.length === 0) return window.showToast('لا توجد بيانات للتصدير', 'error');
    const titleHeader = getReportTitleHeader("تقرير النقاط والمهام YLY");
    const headers = ["م", "كود العضو", "اسم العضو", "المهمة / التقييم", "النقاط المكتسبة", "التاريخ", "الوقت"];
    const rows = state.currentReportData.points.map((p, i) => [ i + 1, p.stdId, p.name, p.type, p.amount, p.date, p.time || '-' ]);
    window.exportToExcelStyle(headers, rows, titleHeader, "تقرير_النقاط_والمهام_YLY");
}

// ==========================================
// 15. Backup System
// ==========================================
window.exportData = function() {
    const data = { members: state.members, attendance: state.attendance, accounting: state.accounting };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_YLY_${today}.json`;
    a.click();
}

window.importData = function(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(data.members || data.attendance || data.accounting) {
                for(const s of (data.members || [])) await addDoc(collection(db, "members"), s);
                for(const a of (data.attendance || [])) await addDoc(collection(db, "attendance"), a);
                for(const c of (data.accounting || [])) await addDoc(collection(db, "accounting"), c);
                window.showToast('تم استعادة البيانات بنجاح!', 'success');
            }
        } catch(err) {
            window.showToast('ملف تالف', 'error');
        }
    };
    reader.readAsText(file);
}

window.showCustomAlert = function(title, message) {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMessage').innerText = message;
    document.getElementById('customAlertModal').style.display = 'flex';
    playSound('error');
}

window.closeCustomAlert = function() {
    document.getElementById('customAlertModal').style.display = 'none';
    state.isPaused = false;
}

window.dismissInstallBanner = function() {
    const pwaBanner = document.getElementById('pwaInstallBanner');
    if(!pwaBanner) return;
    pwaBanner.classList.remove('translate-y-0', 'opacity-100');
    pwaBanner.classList.add('translate-y-24', 'opacity-0');
    setTimeout(() => pwaBanner.classList.add('hidden'), 500);
};
// ==========================================
// 16. Lazy Loading Scroll Observers
// ==========================================
document.getElementById('internalAttendancePage').addEventListener('scroll', function() {
    if (this.scrollTop + this.clientHeight >= this.scrollHeight - 50) {
        const totalPages = Math.ceil(state.attCachedList.length / 30) || 1;
        if (state.attCurrentPage < totalPages) {
            const loading = document.getElementById('intAttLoading');
            if (loading && loading.classList.contains('hidden')) {
                loading.classList.remove('hidden');
                loading.classList.add('flex');
                
                setTimeout(() => {
                    state.attCurrentPage++;
                    renderInternalAttendanceList(true); 
                    loading.classList.add('hidden');
                    loading.classList.remove('flex');
                }, 300);
            }
        }
    }
});

document.getElementById('internalReportPage').addEventListener('scroll', function() {
    let list = state.currentReportCategory === 'points' ? state.currentReportData.points : state.currentReportData.combined;
    const filterStage = document.getElementById('intRepFilter').value;
    const searchQuery = document.getElementById('intRepSearch').value.toLowerCase().trim();
    
    if(searchQuery) list = list.filter(item => (item.name||'').toLowerCase().includes(searchQuery) || (item.id && item.id.includes(searchQuery)) || (item.stdId && item.stdId.includes(searchQuery)));
    if(filterStage !== 'all') list = list.filter(item => item.level === filterStage || item.stdLevel === filterStage);

    if (this.scrollTop + this.clientHeight >= this.scrollHeight - 50) {
        const totalPages = Math.ceil(list.length / 30) || 1;
        if (state.reportCurrentPage < totalPages) {
            const loading = document.getElementById('intRepLoading');
            if (loading && loading.classList.contains('hidden')) {
                loading.classList.remove('hidden');
                loading.classList.add('flex');

                setTimeout(() => {
                    state.reportCurrentPage++;
                    window.renderInternalReportList(true); 
                    loading.classList.add('hidden');
                    loading.classList.remove('flex');
                }, 300);
            }
        }
    }
});
