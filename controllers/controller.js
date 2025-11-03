const model = require('../models/model');
const common = require('../common/common');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer 설정: 파일 저장 위치 및 파일명 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/students');
        // 디렉토리가 없으면 생성
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 파일명: 학번_timestamp.확장자 (예: 202512345_1699999999999.jpg)
        const user = req.session.user;
        const studentNum = user.student_num || user.pkid;
        const ext = path.extname(file.originalname);
        cb(null, `${studentNum}_${Date.now()}${ext}`);
    }
});

// 파일 필터: 이미지 파일만 허용
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('이미지 파일만 업로드 가능합니다 (jpg, jpeg, png, gif)'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
    fileFilter: fileFilter
});

const main = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        
        // 공지사항 가져오기
        const list = await model.getRecentAnnouncements(5);
        const announcements = list.map(a => ({
            ...a,
            created_at: (() => {
                const d = new Date(a.created_at);
                if (isNaN(d)) return '';
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            })()
        }));

        // 오늘의 일정 가져오기 (로그인한 경우에만)
        let todaySchedule = [];
        if (user) {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const dayOfWeek = now.getDay(); // 0=일, 1=월, ..., 6=토
            
            // 개인 일정 가져오기
            const personalEvents = await model.getTodayPersonalEvents(user.pkid, today);
            
            // 시간표 가져오기 (월~금만)
            let timetableEntries = [];
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                timetableEntries = await model.getTodayTimetable(user.pkid, dayOfWeek);
            }

            // 교시를 시간으로 변환하는 함수
            const periodToTime = (period) => {
                // 모든 교시를 1시간 간격으로 (1교시=09:00부터)
                const base = new Date(2000, 0, 1, 9, 0, 0);
                base.setMinutes(base.getMinutes() + (period - 1) * 60);
                return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
            };

            // 개인 일정 추가
            personalEvents.forEach(e => {
                todaySchedule.push({
                    title: e.title,
                    time: e.time || '',
                    location: '',
                    color: e.color,
                    type: 'event'
                });
            });

            // 시간표 수업 추가
            timetableEntries.forEach(e => {
                const startTime = periodToTime(e.start_period);
                const endPeriod = e.end_period + 1; // 종료 교시의 다음 교시 시작 시간
                const endTime = periodToTime(endPeriod);
                todaySchedule.push({
                    title: e.title,
                    time: `${startTime} - ${endTime}`,
                    location: e.location || '',
                    color: e.color,
                    type: 'class'
                });
            });

            // 시간 순으로 정렬
            todaySchedule.sort((a, b) => {
                const timeA = a.time.split(' - ')[0] || a.time || '99:99';
                const timeB = b.time.split(' - ')[0] || b.time || '99:99';
                return timeA.localeCompare(timeB);
            });
        }

        res.render('Main', { announcements, todaySchedule, userName: user ? user.name : '키우미' });
    } catch (err) {
        console.error(err);
        res.status(500).send("500 Error");
    }
}

const calendar = (req, res) => {
    try {
        res.render('Calendar');
    } catch {
        res.status(500).send("500 Error");
    }
}

const announcement = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        const list = await model.getAnnouncements();
        const formatted = list.map(a => ({
            ...a,
            created_at: (() => {
                const d = new Date(a.created_at);
                if (isNaN(d)) return '';
                const y = d.getFullYear();
                const m = String(d.getMonth()+1).padStart(2,'0');
                const day = String(d.getDate()).padStart(2,'0');
                return `${y}-${m}-${day}`;
            })()
        }));
        
        // 사용자 역할 확인
        const isAdmin = user && user.isAdmin === true;
        
        res.render('Announcement', { 
            announcements: formatted,
            isAdmin: isAdmin
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('500 Error');
    }
}

// 관리자용 공지 목록 (호환성을 위해 유지, announcement로 리다이렉트)
const announcementAdmin = async (req, res) => {
    res.redirect('/Announcement');
}

// 게스트용 공지 목록 (호환성을 위해 유지, announcement로 리다이렉트)
const announcementGuest = async (req, res) => {
    res.redirect('/Announcement');
}

// 공지 생성 처리
const createAnnouncement = async (req, res) => {
    try {
        let { title, content, category } = req.body;
        const author_pkid = req.session && req.session.user ? req.session.user.pkid : null;
        if (!author_pkid) return res.status(403).send('권한 없음');

        // 간단한 검증/필터
        title = common.reqeustFilter(title, 255, false);
        content = common.reqeustFilter(content, 5000, false);
        category = common.reqeustFilter(category, 50, false);

        const id = await model.createAnnouncement(title, content, author_pkid, category);
        common.alertAndGo(res, '공지 등록 완료', '/AnnouncementAdmin');
    } catch (err) {
        console.error(err);
        res.status(500).send('500 Error');
    }
}

// 공지 작성 페이지 (GET)
const addAnnouncement = (req, res) => {
    try {
        res.render('CreateAnnouncement');
    } catch (err) {
        console.error(err);
        res.status(500).send('500 Error');
    }
}

const calculator = (req, res) => {
    try {
        res.render('Calculator');
    } catch {
        res.status(500).send("500 Error");
    }
}

const timetable = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.redirect('/Login');

        const entries = await model.getTimetableByUser(user.pkid);

        // 최대 교시 결정 (데이터가 없으면 기본 8교시까지 표시, 최대 10교시)
        let maxPeriod = Math.min(10, Math.max(8, ...(entries.map(e => e.end_period)), 0));
        if (!isFinite(maxPeriod) || maxPeriod <= 0) maxPeriod = 8;

        // 교시별 시작 시각 계산 함수
        const periodStartLabel = (p) => {
            // 모든 교시를 1시간 간격으로 (1교시=09:00부터)
            const base = new Date(2000,0,1,9,0,0);
            base.setMinutes(base.getMinutes() + (p-1)*60);
            const hh = String(base.getHours()).padStart(2,'0');
            const mm = String(base.getMinutes()).padStart(2,'0');
            return `${hh}:${mm}`;
        };

        // 행(교시)별 셀 구성: 월(1)~금(5)
        const dayNames = ['월','화','수','목','금'];
        const rows = [];
        for (let p = 1; p <= maxPeriod; p++) {
            const cells = [];
            for (let d = 1; d <= 5; d++) {
                // 해당 교시 범위에 포함되는 강의가 있는지 찾기 (가장 먼저 매칭되는 하나 표시)
                const found = entries.find(e => e.day === d && e.start_period <= p && e.end_period >= p);
                if (found) {
                    cells.push({
                        title: found.title,
                        location: found.location || '',
                        color: found.color || 'bg-white',
                    });
                } else {
                    cells.push(null);
                }
            }
            rows.push({ period: p, time: periodStartLabel(p), cells });
        }

        res.render('Timetable', { rows, dayNames });
    } catch (err) {
        console.error(err);
        res.status(500).send("500 Error");
    }
}

const myPage = (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return common.alertAndGo(res, '로그인이 필요합니다.', '/Login');
        }
        res.render('MyPage', { user });
    } catch {
        res.status(500).send("500 Error");
    }
}

const addEvent = (req, res) => {
    try {
        res.render('AddEvent');
    } catch {
        res.status(500).send("500 Error");
    }
}

// 개인 일정 생성 (POST)
const createPersonalEvent = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        let { title, event_date, event_time, event_color } = req.body;

        // 간단 검증 및 길이 제한
        title = common.reqeustFilter(title, 255, false);
        event_date = common.reqeustFilter(event_date, 20, false); // YYYY-MM-DD
        event_color = common.reqeustFilter(event_color, 30, false); // tailwind class like bg-red-200
        
        // event_time은 선택 사항 (빈 문자열이면 null로 처리)
        if (event_time && event_time.trim()) {
            event_time = common.reqeustFilter(event_time, 20, false);
        } else {
            event_time = null;
        }

        // 날짜/시간 정규식 검증
        if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
            return res.status(400).json({ ok: false, message: '잘못된 날짜 형식' });
        }
        if (event_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(event_time)) {
            return res.status(400).json({ ok: false, message: '잘못된 시간 형식' });
        }
        // 색상 클래스 화이트리스트 패턴
        if (!/^bg-(red|blue|green|yellow)-(100|200|300|400|500|600|700|800|900)$/.test(event_color)) {
            return res.status(400).json({ ok: false, message: '허용되지 않는 색상' });
        }

        const id = await model.createPersonalEvent(user.pkid, title, event_date, event_time, event_color);
        return res.json({ ok: true, id });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 월별 개인 일정 조회 API (JSON)
const getPersonalEventsApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        const year = parseInt(req.query.year, 10);
        const month = parseInt(req.query.month, 10); // 1..12
        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({ ok: false, message: '잘못된 파라미터' });
        }

        const rows = await model.getPersonalEventsByMonth(user.pkid, year, month);
        return res.json({ ok: true, events: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

const addClass = (req, res) => {
    try {
        res.render('AddClass');
    } catch {
        res.status(500).send("500 Error");
    }
}

// 시간 문자열을 교시로 변환하는 헬퍼 (모든 교시 1시간 간격)
const timeToPeriod = (hhmm) => {
    const m = /^([0-2]?\d):(\d{2})$/.exec(hhmm || '');
    if (!m) return null;
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    
    // 09:00부터 시작, 1시간 간격으로 10교시까지
    if (h >= 9 && h < 19) {  // 9시~18시
        if (min !== 0) return null; // 정시만 허용
        const period = (h - 9) + 1; // 9시=>1교시, 10시=>2교시, ...
        if (period < 1 || period > 10) return null;
        return period;
    }
    return null;
}

// 수업 추가 처리 (POST)
const addClassProc = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return common.alertAndGo(res, '로그인이 필요합니다.', '/Login');

        let { title, class_color } = req.body;
        title = common.reqeustFilter(title, 100, false);
        class_color = common.reqeustFilter(class_color || 'bg-blue-100', 30, false);

        // 다중 슬롯 필드 (배열로 수신)
        let day = req.body.day || [];
        let start_time = req.body.start_time || [];
        let end_time = req.body.end_time || [];
        let place = req.body.place || [];

        if (!Array.isArray(day)) day = [day];
        if (!Array.isArray(start_time)) start_time = [start_time];
        if (!Array.isArray(end_time)) end_time = [end_time];
        if (!Array.isArray(place)) place = [place];

        const dayMap = { '월':1, '화':2, '수':3, '목':4, '금':5 };
        let saved = 0;

        for (let i = 0; i < day.length; i++) {
            const dKor = (day[i] || '').trim();
            const dNum = dayMap[dKor];
            const st = (start_time[i] || '').trim();
            const et = (end_time[i] || '').trim();
            if (!dNum) continue;
            const sp = timeToPeriod(st);
            const epStart = timeToPeriod(et); // 종료 시각이 다음 교시의 시작이면 ep = epStart - 1
            if (sp == null || epStart == null) continue;
            const ep = epStart - 1;
            if (ep < sp || sp < 1 || ep > 10) continue; // 10교시까지만

            const location = common.reqeustFilter(place[i] || '', 100, false, '');
            await model.addTimetableEntry(user.pkid, dNum, sp, ep, title, location, class_color);
            saved++;
        }

        if (saved === 0) return common.alertAndGo(res, '유효한 수업 시간이 없습니다. 교시 경계에 맞춰 입력해주세요.', '/AddClass');
        return common.alertAndGo(res, '시간표에 추가되었습니다.', '/Timetable');
    } catch (err) {
        console.error(err);
        return res.status(500).send('500 Error');
    }
}

const login = (req, res) => {
    try {
        res.render('Login');
    } catch {
        // 500 : 시스템 에러
        res.status(500).send("500 Error");
    }
}

const loginProc = async (req, res) => {
    try {
        let {student_num, student_pw} = req.body;

        student_num = common.reqeustFilter(student_num, 20, false);
        student_pw = common.reqeustFilter(student_pw, 20, false);

        // 먼저 학생 계정으로 로그인 시도
        let result = await model.loginCheck(student_num, student_pw);
        let isAdmin = false;

        // 학생 계정이 없으면 관리자 계정으로 시도
        if (!result) {
            result = await model.adminLoginCheck(student_num, student_pw);
            isAdmin = true;
        }

        if(result != null) {
            // 로그인처리 ==> 세션 저장
            if (isAdmin) {
                // 관리자 로그인
                req.session.user = {
                    pkid: result.pkid,
                    name: result.name,
                    admin_id: result.admin_id,
                    role: result.role,
                    isAdmin: true
                };
            } else {
                // 학생 로그인
                req.session.user = {
                    pkid: result.pkid,
                    name: result.name,
                    student_num: result.student_num,
                    photo_url: result.photo_url,
                    is_fee_paid: result.is_fee_paid,
                    isAdmin: false
                };
            }

            // 로그인 성공 시 메인으로 리다이렉트
            common.alertAndGo(res, '로그인 되었습니다.', '/');
        } else {
            // 아이디 또는 비번이 틀린 경우
            res.send('<script>alert("아이디 또는 비밀번호가 잘못되었습니다."); location.href="/Login";</script>');
        }
    } catch {
        res.status(500).send("500 Error");
    }
}

const logout = (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.log("세션 삭제 실패");
        }
        common.alertAndGo(res, '로그아웃 되었습니다.', '/');
    })
}

// 사진 업로드 처리
const uploadPhotoProc = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user || !user.pkid) {
            return res.status(401).send('<script>alert("로그인이 필요합니다."); location.href="/Login";</script>');
        }

        // multer가 처리한 파일 정보
        if (!req.file) {
            return res.send('<script>alert("파일이 업로드되지 않았습니다."); history.back();</script>');
        }

        // 파일 경로를 DB에 저장 (웹 경로)
        const photoUrl = `/uploads/students/${req.file.filename}`;
        await model.updateStudentPhoto(user.pkid, photoUrl);

        // 세션 업데이트
        req.session.user.photo_url = photoUrl;

        common.alertAndGo(res, '사진이 업로드되었습니다.', '/MyPage');
    } catch (err) {
        console.error(err);
        res.status(500).send('<script>alert("사진 업로드 중 오류가 발생했습니다."); history.back();</script>');
    }
}

// 공지 상세보기
const viewAnnouncement = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        const pkid = req.params.id || req.query.id;
        if (!pkid) return res.status(400).send('공지 ID가 필요합니다.');
        
        const announcement = await model.getAnnouncementById(pkid);
        if (!announcement) return res.status(404).send('공지를 찾을 수 없습니다.');
        
        // 날짜 포맷팅
        const d = new Date(announcement.created_at);
        if (!isNaN(d)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            announcement.created_at = `${y}-${m}-${day}`;
        }
        
        // 관리자 여부 확인
        const isAdmin = user && user.isAdmin === true;
        
        res.render('ViewAnnouncement', { announcement, isAdmin });
    } catch (err) {
        console.error(err);
        res.status(500).send("500 Error");
    }
}

// 공지 수정 페이지
const modifyAnnouncement = async (req, res) => {
    try {
        const pkid = req.params.id || req.query.id;
        if (!pkid) return res.status(400).send('공지 ID가 필요합니다.');
        
        const announcement = await model.getAnnouncementById(pkid);
        if (!announcement) return res.status(404).send('공지를 찾을 수 없습니다.');
        
        res.render('ModifyAnnouncement', { announcement });
    } catch (err) {
        console.error(err);
        res.status(500).send("500 Error");
    }
}

// 공지 수정 처리
const modifyAnnouncementProc = async (req, res) => {
    try {
        const pkid = req.params.id || req.body.pkid;
        let { title, content, category } = req.body;
        
        if (!pkid) return res.status(400).send('공지 ID가 필요합니다.');
        
        title = common.reqeustFilter(title, 255, false);
        content = common.reqeustFilter(content, 5000, false);
        category = common.reqeustFilter(category, 50, false);
        
        const affected = await model.updateAnnouncement(pkid, title, content, category);
        if (affected === 0) return res.status(404).send('공지를 찾을 수 없습니다.');
        
        common.alertAndGo(res, '공지가 수정되었습니다.', '/Announcement');
    } catch (err) {
        console.error(err);
        res.status(500).send('500 Error');
    }
}

// 공지 삭제 처리
const deleteAnnouncementProc = async (req, res) => {
    try {
        const pkid = req.params.id || req.body.pkid;
        if (!pkid) return res.status(400).send('공지 ID가 필요합니다.');
        
        const affected = await model.deleteAnnouncement(pkid);
        if (affected === 0) return res.status(404).send('공지를 찾을 수 없습니다.');
        
        common.alertAndGo(res, '공지가 삭제되었습니다.', '/Announcement');
    } catch (err) {
        console.error(err);
        res.status(500).send('500 Error');
    }
}

// 수업 상세보기
const viewClass = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.redirect('/Login');
        
        const id = req.params.id || req.query.id;
        if (!id) return res.status(400).send('수업 ID가 필요합니다.');
        
        const classInfo = await model.getTimetableById(id, user.pkid);
        if (!classInfo) return res.status(404).send('수업을 찾을 수 없습니다.');
        
        // 요일 변환
        const dayMap = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
        classInfo.dayName = dayMap[classInfo.day] || '';
        
        // 교시를 시간으로 변환
        const periodToTime = (period) => {
            const base = new Date(2000, 0, 1, 9, 0, 0);
            base.setMinutes(base.getMinutes() + (period - 1) * 60);
            return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
        };
        
        classInfo.start_time = periodToTime(classInfo.start_period);
        classInfo.end_time = periodToTime(classInfo.end_period + 1);
        
        res.render('ViewClass', { classInfo });
    } catch (err) {
        console.error(err);
        res.status(500).send("500 Error");
    }
}

// 수업 수정 페이지
const modifyClass = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.redirect('/Login');
        
        const id = req.params.id || req.query.id;
        if (!id) return res.status(400).send('수업 ID가 필요합니다.');
        
        const classInfo = await model.getTimetableById(id, user.pkid);
        if (!classInfo) return res.status(404).send('수업을 찾을 수 없습니다.');
        
        // 요일 변환
        const dayMap = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
        classInfo.dayName = dayMap[classInfo.day] || '';
        
        // 교시를 시간으로 변환
        const periodToTime = (period) => {
            const base = new Date(2000, 0, 1, 9, 0, 0);
            base.setMinutes(base.getMinutes() + (period - 1) * 60);
            return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
        };
        
        classInfo.start_time = periodToTime(classInfo.start_period);
        classInfo.end_time = periodToTime(classInfo.end_period + 1);
        
        res.render('ModifyClass', { classInfo });
    } catch (err) {
        console.error(err);
        res.status(500).send("500 Error");
    }
}

// 알림 페이지
const notifications = (req, res) => {
    try {
        res.render('Notifications');
    } catch {
        res.status(500).send("500 Error");
    }
}

module.exports = {
    main,
    calendar,
    announcement,
    announcementAdmin,
    announcementGuest,
    addAnnouncement,
    createAnnouncement,
    viewAnnouncement,
    modifyAnnouncement,
    modifyAnnouncementProc,
    deleteAnnouncementProc,
    calculator,
    timetable,
    myPage,
    uploadPhotoProc,
    addEvent,
    createPersonalEvent,
    getPersonalEventsApi,
    addClass,
    addClassProc,
    viewClass,
    modifyClass,
    notifications,
    login,
    loginProc,
    logout,
    upload
}