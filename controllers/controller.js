const model = require('../models/model');
const common = require('../common/common');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bwipjs = require('bwip-js');
const mailer = require('../common/mailer');

// 일정 알림 타이머 저장소 (eventId를 키로 사용)
const eventNotificationTimers = new Map();

// Multer 설정: 파일 저장 위치 및 파일명 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const user = req.session.user;
        const uploadDir = user && user.isAdmin 
            ? path.join(__dirname, '../uploads/admin')
            : path.join(__dirname, '../uploads/students');
        // 디렉토리가 없으면 생성
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 파일명: 학번_timestamp.확장자 (예: 202512345_1699999999999.jpg)
        const user = req.session.user;
        const identifier = user.isAdmin 
            ? (user.employee_num || user.admin_id || user.pkid)
            : (user.student_num || user.pkid);
        const ext = path.extname(file.originalname);
        cb(null, `${identifier}_${Date.now()}${ext}`);
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

// 공지사항 첨부파일용 Multer 설정
const announcementStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/announcements');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        cb(null, `${timestamp}_${basename}${ext}`);
    }
});

const announcementFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|hwp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
        return cb(null, true);
    } else {
        cb(new Error('허용되지 않는 파일 형식입니다.'));
    }
};

const uploadAnnouncement = multer({
    storage: announcementStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 제한
    fileFilter: announcementFileFilter
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

        // 학점 현황 가져오기 (학생인 경우에만)
        let gpaInfo = null;
        if (user && !user.isAdmin) {
            const grades = await model.getGradesByUser(user.pkid);
            
            const gradeToPoint = (grade) => {
                const map = { 'A+': 4.5, 'A0': 4.0, 'B+': 3.5, 'B0': 3.0, 'C+': 2.5, 'C0': 2.0, 'D+': 1.5, 'D0': 1.0, 'F': 0.0 };
                return map[grade] ?? null;
            };

            let totalEarnedCredits = 0;
            let gpaCredits = 0;
            let totalPoints = 0;

            grades.forEach(g => {
                const point = gradeToPoint(g.grade);
                const credit = g.credits || 0;

                if (point !== null) {
                    gpaCredits += credit;
                    totalPoints += point * credit;
                }

                if (g.grade !== 'F') {
                    totalEarnedCredits += credit;
                }
            });

            const overallGPA = gpaCredits > 0 ? (totalPoints / gpaCredits).toFixed(2) : '0.00';
            gpaInfo = {
                gpa: overallGPA,
                totalCredits: totalEarnedCredits
            };
        }

        // 오늘의 일정 가져오기 (로그인한 경우에만)
        let todaySchedule = [];
        if (user) {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const dayOfWeek = now.getDay(); // 0=일, 1=월, ..., 6=토
            
            // 개인 일정 가져오기
            const userType = user.isAdmin ? 'admin' : 'student';
            const personalEvents = await model.getTodayPersonalEvents(user.pkid, userType, today);
            
            // 시간표 가져오기 (학생만, 월~금만)
            let timetableEntries = [];
            if (!user.isAdmin && dayOfWeek >= 1 && dayOfWeek <= 5) {
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

        const user_role = user ? (user.isAdmin ? 'admin' : 'student') : 'guest';

        res.render('Main', { 
            announcements, 
            todaySchedule, 
            userName: user ? user.name : '키우미',
            user_role: user_role,
            gpaInfo: gpaInfo
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("500 Error");
    }
}

const calendar = (req, res) => {
    try {
        const user = req.session && req.session.user;
        const user_role = user ? (user.isAdmin ? 'admin' : 'student') : 'guest';
        res.render('Calendar', { user_role });
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
        const user_role = user ? (user.isAdmin ? 'admin' : 'student') : 'guest';
        
        res.render('Announcement', { 
            announcements: formatted,
            isAdmin: isAdmin,
            user_role: user_role
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

        // 첨부파일 정보 JSON으로 저장
        let attachments = null;
        if (req.files && req.files.length > 0) {
            attachments = JSON.stringify(req.files.map(file => ({
                filename: file.filename,
                originalname: file.originalname,
                size: file.size,
                path: `/uploads/announcements/${file.filename}`
            })));
        }

        const id = await model.createAnnouncement(title, content, author_pkid, category, attachments);
        
        // 알림 생성: 모든 사용자에게 전송
        try {
            await model.createNotificationForAll(
                'announcement',
                '새 공지사항',
                `'${title}' 공지가 등록되었습니다.`,
                `/ViewAnnouncement?id=${id}`
            );
        } catch (notifErr) {
            console.error('알림 생성 오류:', notifErr);
        }
        
        common.alertAndGo(res, '공지 등록 완료', '/Announcement');
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

// 학점 계산기 페이지
const calculator = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user || user.isAdmin) return res.redirect('/Login');

        // 사용자 전체 성적 조회
        const grades = await model.getGradesByUser(user.pkid);

        // 점수 맵핑
        const gradeToPoint = (grade) => {
            const map = { 'A+': 4.5, 'A0': 4.0, 'B+': 3.5, 'B0': 3.0, 'C+': 2.5, 'C0': 2.0, 'D+': 1.5, 'D0': 1.0, 'F': 0.0 };
            return map[grade] ?? null; // P 등은 null
        };

        // 전체 GPA/학점 계산
        let totalEarnedCredits = 0; // F 제외, P 포함
        let gpaCredits = 0;         // GPA 계산 대상 (A+~F)
        let totalPoints = 0;
        
        let majorGpaCredits = 0;    // 전공 GPA 계산 대상
        let majorTotalPoints = 0;

        grades.forEach(g => {
            const point = gradeToPoint(g.grade);
            const credit = g.credits || 0;

            if (point !== null) {
                gpaCredits += credit;
                totalPoints += point * credit;
                
                // 전공 과목만 따로 계산
                if (g.is_major) {
                    majorGpaCredits += credit;
                    majorTotalPoints += point * credit;
                }
            }

            if (g.grade !== 'F') {
                totalEarnedCredits += credit;
            }
        });

        const overallGPA = gpaCredits > 0 ? (totalPoints / gpaCredits).toFixed(2) : '0.00';
        const majorGPA = majorGpaCredits > 0 ? (majorTotalPoints / majorGpaCredits).toFixed(2) : '0.00';

        // 학기별 그룹화
        const semestersMap = {};
        grades.forEach(g => {
            const key = `${g.year}-${g.semester}`;
            if (!semestersMap[key]) {
                semestersMap[key] = { year: g.year, semester: g.semester, courses: [] };
            }
            semestersMap[key].courses.push(g);
        });
    // 최근 학기(연도/학기 내림차순) 먼저 보이도록 정렬
    const semesters = Object.values(semestersMap).sort((a,b)=> a.year===b.year ? b.semester - a.semester : b.year - a.year);

        res.render('Calculator', { overallGPA, majorGPA, totalCredits: totalEarnedCredits, semesters });
    } catch (err) {
        console.error(err);
        res.status(500).send("500 Error");
    }
}

const timetable = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.redirect('/Login');

        // 1. 기존 시간표 데이터 가져오기 (관리자는 빈 배열)
        const entries = user.isAdmin ? [] : await model.getTimetableByUser(user.pkid);
        
        let maxPeriod = Math.min(10, Math.max(8, ...(entries.map(e => e.end_period)), 0));
        if (!isFinite(maxPeriod) || maxPeriod <= 0) maxPeriod = 8;
        const periodStartLabel = (p) => {
            const base = new Date(2000,0,1,9,0,0);
            base.setMinutes(base.getMinutes() + (p-1)*60);
            const hh = String(base.getHours()).padStart(2,'0');
            const mm = String(base.getMinutes()).padStart(2,'0');
            return `${hh}:${mm}`;
        };
        const dayNames = ['월','화','수','목','금'];
        const rows = [];
        for (let p = 1; p <= maxPeriod; p++) {
            const cells = [];
            for (let d = 1; d <= 5; d++) {
                const found = entries.find(e => e.day === d && e.start_period <= p && e.end_period >= p);
                if (found) {
                    cells.push({
                        id: found.id,
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

        // 2. 학점 데이터 가져오기 (관리자는 빈 배열)
        const grades = user.isAdmin ? [] : await model.getGradesByUser(user.pkid);

        // 3. 학점 계산 로직 수정
        const gradeToPoint = (grade) => {
            const map = { 'A+': 4.5, 'A0': 4.0, 'B+': 3.5, 'B0': 3.0, 'C+': 2.5, 'C0': 2.0, 'D+': 1.5, 'D0': 1.0, 'F': 0.0 };
            return map[grade] ?? null; // P/F 과목 등을 위해 null 반환
        };

        let totalEarnedCredits = 0; // 총 취득 학점 (P/F 포함, F 제외)
        let gpaCredits = 0;         // 전체 평점 계산에 사용될 학점 (A+~F)
        let totalPoints = 0;        // 전체 (학점 * 점수) 합계

        let majorGpaCredits = 0;    // 전공 평점 계산에 사용될 학점 (A+~F, 전공만)
        let majorTotalPoints = 0;   // 전공 (학점 * 점수) 합계

        grades.forEach(g => {
            const point = gradeToPoint(g.grade);
            const credit = g.credits || 0;

            // 전체 평점 계산 (A+~F 포함, P는 제외)
            if (point !== null) {
                gpaCredits += credit;
                totalPoints += point * credit;
            }

            // 전공 평점 계산 (is_major == 1인 과목만, P 제외)
            if (g.is_major && point !== null) {
                majorGpaCredits += credit;
                majorTotalPoints += point * credit;
            }

            // 총 취득 학점 계산 (F 제외, P 포함 규칙 적용)
            if (g.grade !== 'F') {
                totalEarnedCredits += credit;
            }
        });

        const overallGPA = gpaCredits > 0 ? (totalPoints / gpaCredits).toFixed(2) : '0.00';
        const majorGPA = majorGpaCredits > 0 ? (majorTotalPoints / majorGpaCredits).toFixed(2) : '0.00';

        // 4. 학기별로 데이터 그룹화
        const semesters = {};
        grades.forEach(g => {
            const key = `${g.year}-${g.semester}`;
            if (!semesters[key]) {
                semesters[key] = { year: g.year, semester: g.semester, courses: [] };
            }
            semesters[key].courses.push(g);
        });

        // 학기별 GPA 계산
        const semesterStats = Object.values(semesters).map(s => {
            let semGpaCredits = 0;
            let semTotalPoints = 0;
            let semMajorGpaCredits = 0;
            let semMajorTotalPoints = 0;

            s.courses.forEach(c => {
                const point = gradeToPoint(c.grade);
                const credit = c.credits || 0;

                if (point !== null) {
                    semGpaCredits += credit;
                    semTotalPoints += point * credit;

                    if (c.is_major) {
                        semMajorGpaCredits += credit;
                        semMajorTotalPoints += point * credit;
                    }
                }
            });

            const semesterGPA = semGpaCredits > 0 ? (semTotalPoints / semGpaCredits).toFixed(2) : '0.00';
            const semesterMajorGPA = semMajorGpaCredits > 0 ? (semMajorTotalPoints / semMajorGpaCredits).toFixed(2) : '0.00';

            return {
                ...s,
                semesterGPA: parseFloat(semesterGPA),
                semesterMajorGPA: parseFloat(semesterMajorGPA)
            };
        });

        // 5. 템플릿에 모든 데이터 전달
        res.render('Timetable', { 
            rows, 
            dayNames,
            semesters: semesterStats,
            overallGPA: overallGPA,
            majorGPA: majorGPA,
            totalCredits: totalEarnedCredits // 총 취득 학점으로 전달
        });
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
        const user_role = user.isAdmin ? 'admin' : 'student';
        res.render('MyPage', { user, user_role });
    } catch {
        res.status(500).send("500 Error");
    }
}

const addEvent = (req, res) => {
    try {
        const user = req.session && req.session.user;
        const user_role = user ? (user.isAdmin ? 'admin' : 'student') : 'guest';
        res.render('AddEvent', { user_role });
    } catch {
        res.status(500).send("500 Error");
    }
}

const viewEvent = (req, res) => {
    try {
        const user = req.session && req.session.user;
        const user_role = user ? (user.isAdmin ? 'admin' : 'student') : 'guest';
        res.render('ViewEvent', { user_role });
    } catch {
        res.status(500).send("500 Error");
    }
}

// 개인/학사 일정 생성 (POST)
const createPersonalEvent = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        const event_type = (req.body.event_type || 'private').toLowerCase();
    let { title, event_date, event_time, event_color, start_date, end_date, memo, alarms } = req.body;

        // 간단 검증 및 길이 제한
        title = common.reqeustFilter(title, 255, false);
        
        if (event_type === 'public') {
            // 관리자만 학사일정 등록 가능
            if (!user.isAdmin) {
                return res.status(403).json({ ok: false, message: '권한이 없습니다.' });
            }
            start_date = common.reqeustFilter(start_date, 20, false);
            end_date = common.reqeustFilter(end_date, 20, false);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
                return res.status(400).json({ ok: false, message: '잘못된 날짜 형식' });
            }
            if (new Date(start_date) > new Date(end_date)) {
                return res.status(400).json({ ok: false, message: '종료일은 시작일보다 빠를 수 없습니다.' });
            }
            const id = await model.createAcademicSchedule(title, start_date, end_date, null, null);
            return res.json({ ok: true, id });
        } else {
            // private (개인 일정)
            // 알림 데이터 파싱
            let alarmsArray = [];
            if (alarms) {
                try {
                    alarmsArray = JSON.parse(alarms);
                } catch (e) {
                    alarmsArray = [];
                }
            }
            
            event_date = common.reqeustFilter(event_date, 20, false); // YYYY-MM-DD
            event_color = common.reqeustFilter(event_color, 30, false); // tailwind class like bg-red-200
            memo = memo ? common.reqeustFilter(memo, 1000, false, '') : null;
            
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

            const id = await model.createPersonalEvent(
                user.pkid,
                user.isAdmin ? 'admin' : 'student',
                title,
                event_date,
                event_time,
                event_color,
                memo,
                alarmsArray
            );
            
            // 일정 알림 생성
            if (alarmsArray && alarmsArray.length > 0) {
                try {
                    await scheduleEventNotifications(user.pkid, user.isAdmin ? 'admin' : 'student', id, title, event_date, event_time, alarmsArray);
                } catch (notifErr) {
                    console.error('일정 알림 생성 오류:', notifErr);
                }
            }
            
            return res.json({ ok: true, id });
        }
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

        const userType = user.isAdmin ? 'admin' : 'student';
        const rows = await model.getPersonalEventsByMonth(user.pkid, userType, year, month);
        return res.json({ ok: true, events: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 월별 학사일정 조회 API (JSON)
const getAcademicScheduleApi = async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10);
        const month = parseInt(req.query.month, 10); // 1..12
        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({ ok: false, message: '잘못된 파라미터' });
        }

        const rows = await model.getAcademicScheduleByMonth(year, month);
        return res.json({ ok: true, items: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 일정 상세 조회 API (개인/학사 통합)
const getEventByIdApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

    const eventId = parseInt(req.params.id, 10);
    const typeRaw = (req.query.type || 'personal').toLowerCase();
    const eventType = (typeRaw === 'public') ? 'academic' : (typeRaw === 'private' ? 'personal' : typeRaw);

        if (!eventId) {
            return res.status(400).json({ ok: false, message: '잘못된 일정 ID' });
        }

        if (eventType === 'academic') {
            // 학사일정 조회
            const event = await model.getAcademicScheduleById(eventId);
            if (!event) {
                return res.status(404).json({ ok: false, message: '일정을 찾을 수 없습니다.' });
            }
            return res.json({
                ok: true,
                id: event.id,
                title: event.title,
                start_date: event.start_date,
                end_date: event.end_date,
                type: 'academic',
                campus: event.campus,
                source_url: event.source_url,
                alarms: [] // 학사일정은 알림 사용 안 함
            });
        } else {
            // 개인일정 조회
            const userType = user.isAdmin ? 'admin' : 'student';
            const event = await model.getPersonalEventById(eventId, user.pkid, userType);
            if (!event) {
                return res.status(404).json({ ok: false, message: '일정을 찾을 수 없습니다.' });
            }
            return res.json({
                ok: true,
                id: event.id,
                title: event.title,
                event_date: event.event_date,
                event_time: event.event_time,
                event_color: event.color,
                color: event.color, // ViewEvent.html 호환성
                memo: event.memo,
                type: 'personal',
                alarms: event.alarms || []
            });
        }
    } catch (err) {
        console.error('일정 조회 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 일정 삭제 API
const deleteEventApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

    const eventId = parseInt(req.params.id, 10);
    const typeRaw = (req.query.type || 'personal').toLowerCase();
    const eventType = (typeRaw === 'public') ? 'academic' : (typeRaw === 'private' ? 'personal' : typeRaw);

        if (!eventId) {
            return res.status(400).json({ ok: false, message: '잘못된 일정 ID' });
        }

        if (eventType === 'academic') {
            // 관리자만 학사일정 삭제 가능
            if (!user.isAdmin) {
                return res.status(403).json({ ok: false, message: '권한이 없습니다.' });
            }
            await model.deleteAcademicSchedule(eventId);
        } else {
            // 개인일정 삭제 (본인만 가능)
            const userType = user.isAdmin ? 'admin' : 'student';
            
            // 스케줄링된 알림 타이머 취소
            cancelEventNotifications(eventId);
            
            await model.deletePersonalEvent(eventId, user.pkid, userType);
            
            // 해당 일정과 관련된 알림도 삭제
            await model.deleteNotificationsByEvent(eventId, user.pkid, userType);
        }

        return res.json({ ok: true, message: '삭제되었습니다.' });
    } catch (err) {
        console.error('일정 삭제 오류:', err);
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

// 모든 과목 및 분반 조회 API
const getAllCoursesApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        const rows = await model.getAllAvailableCourses();
        
        // 데이터를 과목별 → 분반별로 그룹화
        const coursesMap = {};
        
        rows.forEach(row => {
            const courseId = row.course_id;
            const sectionId = row.section_id;
            
            // 과목이 처음 등장하면 초기화
            if (!coursesMap[courseId]) {
                coursesMap[courseId] = {
                    id: courseId,
                    title: row.title,
                    credits: row.credits,
                    department: row.department,
                    sections: {}
                };
            }
            
            // 분반이 처음 등장하면 초기화
            if (!coursesMap[courseId].sections[sectionId]) {
                coursesMap[courseId].sections[sectionId] = {
                    id: sectionId,
                    section_number: row.section_number,
                    professor: row.professor,
                    classroom: row.classroom,
                    schedules: []
                };
            }
            
            // 해당 분반의 시간 정보 추가
            coursesMap[courseId].sections[sectionId].schedules.push({
                day_of_week: row.day_of_week,
                start_period: row.start_period,
                end_period: row.end_period
            });
        });
        
        // Map을 배열로 변환하고 sections도 배열로 변환
        const courses = Object.values(coursesMap).map(course => {
            const sections = Object.values(course.sections).map(section => {
                // 시간 정보를 사람이 읽을 수 있는 형태로 변환
                const dayMap = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
                const periodToTime = (period) => {
                    const hour = 8 + period; // 1교시=09:00
                    return `${String(hour).padStart(2, '0')}:00`;
                };
                
                // 요일별로 그룹화해서 시간 문자열 생성
                const schedulesByDay = {};
                section.schedules.forEach(sch => {
                    const day = dayMap[sch.day_of_week] || sch.day_of_week;
                    if (!schedulesByDay[day]) schedulesByDay[day] = [];
                    schedulesByDay[day].push({
                        start: sch.start_period,
                        end: sch.end_period
                    });
                });
                
                const timeStrings = [];
                Object.keys(schedulesByDay).sort().forEach(day => {
                    schedulesByDay[day].forEach(time => {
                        const startTime = periodToTime(time.start);
                        const endTime = periodToTime(time.end + 1); // 종료 교시의 다음 시간
                        timeStrings.push(`${day} ${startTime}~${endTime}`);
                    });
                });
                
                return {
                    id: section.id,
                    section_number: section.section_number,
                    professor: section.professor,
                    time_string: timeStrings.join(', '),
                    place: section.classroom,
                    schedules: section.schedules // 원본 스케줄 정보도 포함
                };
            });
            
            return {
                id: course.id,
                title: course.title,
                credits: course.credits,
                department: course.department,
                sections: sections
            };
        });
        
        return res.json(courses);
    } catch (err) {
        console.error('과목 조회 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 특정 과목의 분반 목록 조회 API
const getCourseSectionsApi = async (req, res) => {
    try {
        const course_id = req.params.courseId;
        if (!course_id) {
            return res.status(400).json({ ok: false, message: '과목 ID가 필요합니다.' });
        }
        
        const sections = await model.getSectionsByCourseId(course_id);
        return res.json(sections);
    } catch (err) {
        console.error('분반 조회 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 시간표에 과목 추가 API (충돌 체크 포함)
const addCourseToTimetableApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user || user.isAdmin) {
            return res.status(401).json({ ok: false, message: '학생만 시간표에 추가할 수 있습니다.' });
        }

        const { section_id, color, memo } = req.body;
        
        if (!section_id) {
            return res.status(400).json({ ok: false, message: '분반 ID가 필요합니다.' });
        }

        // 1. 분반 정보 조회
        const sectionDetails = await model.getSectionDetails(section_id);
        if (!sectionDetails || sectionDetails.length === 0) {
            return res.status(404).json({ ok: false, message: '해당 분반을 찾을 수 없습니다.' });
        }

        const courseTitle = sectionDetails[0].title;
        const credits = sectionDetails[0].credits;
        const professor = sectionDetails[0].professor;
        const classroom = sectionDetails[0].classroom;

        // 2. 이미 같은 과목을 추가했는지 확인
        const alreadyAdded = await model.checkCourseAlreadyAdded(user.pkid, courseTitle);
        if (alreadyAdded) {
            return res.status(409).json({ 
                ok: false, 
                message: '이미 시간표에 추가된 과목입니다.',
                conflictType: 'duplicate_course'
            });
        }

        // 3. 시간 충돌 체크
        const conflicts = [];
        for (const schedule of sectionDetails) {
            const conflict = await model.checkTimetableConflict(
                user.pkid,
                schedule.day_of_week,
                schedule.start_period,
                schedule.end_period
            );
            if (conflict) {
                conflicts.push({
                    day: schedule.day_of_week,
                    conflictWith: conflict.title,
                    time: `${schedule.start_period}-${schedule.end_period}교시`
                });
            }
        }

        if (conflicts.length > 0) {
            const dayMap = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
            const conflictMessages = conflicts.map(c => 
                `${dayMap[c.day]}요일 ${c.time}: ${c.conflictWith}`
            ).join(', ');
            
            return res.status(409).json({ 
                ok: false, 
                message: `시간이 겹치는 수업이 있습니다: ${conflictMessages}`,
                conflictType: 'time_conflict',
                conflicts: conflicts
            });
        }

        // 4. 시간표에 추가 (각 시간대별로)
        const classColor = color || 'bg-blue-100';
        for (const schedule of sectionDetails) {
            await model.addTimetableEntry(
                user.pkid,
                schedule.day_of_week,
                schedule.start_period,
                schedule.end_period,
                courseTitle,
                classroom,
                classColor,
                memo || null,
                professor,
                credits
            );
        }

        return res.json({ 
            ok: true, 
            message: '시간표에 성공적으로 추가되었습니다.',
            course: courseTitle
        });
    } catch (err) {
        console.error('시간표 추가 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류가 발생했습니다.' });
    }
}

// ModifyEvent 페이지 렌더
const modifyEvent = (req, res) => {
    try {
        res.render('ModifyEvent');
    } catch {
        res.status(500).send('500 Error');
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

        let { title, class_color, memo, professor, credits } = req.body;
        title = common.reqeustFilter(title, 100, false);
        class_color = common.reqeustFilter(class_color || 'bg-blue-100', 30, false);
        memo = memo ? common.reqeustFilter(memo, 1000, false, '') : null;
        professor = professor ? common.reqeustFilter(professor, 100, false, '') : null;
        credits = credits ? parseInt(credits, 10) : null;

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
            await model.addTimetableEntry(user.pkid, dNum, sp, ep, title, location, class_color, memo, professor, credits);
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

const join = (req, res) => {
    try {
        res.render('Join');
    } catch {
        res.status(500).send("500 Error");
    }
}

// 비밀번호 찾기/인증/재설정 페이지 렌더
const forgotPassword = (req, res) => {
    try {
        res.render('ForgotPassword');
    } catch {
        res.status(500).send('500 Error');
    }
}

const verifyCode = (req, res) => {
    try {
        res.render('VerifyCode');
    } catch {
        res.status(500).send('500 Error');
    }
}

const resetPassword = (req, res) => {
    try {
        res.render('ResetPassword');
    } catch {
        res.status(500).send('500 Error');
    }
}

const registerProc = async (req, res) => {
    try {
    let { name, student_id, username, password, password_confirm, email, phone } = req.body;

        // 입력값 필터링 및 검증
        name = common.reqeustFilter(name, 100, false);
        student_id = common.reqeustFilter(student_id, 50, false);
        username = common.reqeustFilter(username, 50, false);
        password = common.reqeustFilter(password, 100, false);
        email = common.reqeustFilter(email, 100, false);
        phone = common.reqeustFilter(phone, 20, false);

        // 필수 항목 체크
        if (!name || !student_id || !username || !password || !email || !phone) {
            return res.status(400).json({ message: '모든 항목을 입력해 주세요.' });
        }

        // 비밀번호 확인
        if (password !== password_confirm) {
            return res.status(400).json({ message: '비밀번호가 일치하지 않습니다.' });
        }

        // 아이디 길이 체크
        if (username.length < 6) {
            return res.status(400).json({ message: '아이디는 6자 이상이어야 합니다.' });
        }

        // 학생/직원 중 누가 사전 등록인지 판별
        const preStudent = await model.checkPreRegisteredStudent(name, student_id);
        const preAdmin = preStudent ? null : await model.checkPreRegisteredAdmin(name, student_id);

        if (!preStudent && !preAdmin) {
            return res.status(400).json({ message: '사전 등록되지 않은 사용자입니다. 이름과 학번/사번을 확인해주세요.' });
        }

        if (preStudent) {
            // 학생 가입 플로우
            const alreadyRegistered = await model.checkStudentAlreadyRegistered(preStudent.pkid);
            if (alreadyRegistered) return res.status(400).json({ message: '이미 가입된 계정입니다.' });

            const usernameExists = await model.checkUsernameExists(username);
            if (usernameExists) return res.status(400).json({ message: '이미 사용 중인 아이디입니다.' });

            const emailExists = await model.checkEmailExists(email);
            if (emailExists) return res.status(400).json({ message: '이미 사용 중인 이메일입니다.' });

            await model.updateStudentRegistration(preStudent.pkid, username, password, email, phone);
            return res.status(200).json({ message: '학생 회원가입이 완료되었습니다.' });
        } else {
            // 관리자(직원) 가입 플로우
            const alreadyRegistered = await model.checkAdminAlreadyRegistered(preAdmin.pkid);
            if (alreadyRegistered) return res.status(400).json({ message: '이미 가입된 관리자 계정입니다.' });

            const usernameExists = await model.checkAdminUsernameExists(username);
            if (usernameExists) return res.status(400).json({ message: '이미 사용 중인 아이디입니다.' });

            const emailExists = await model.checkAdminEmailExists(email);
            if (emailExists) return res.status(400).json({ message: '이미 사용 중인 이메일입니다.' });

            await model.updateAdminRegistration(preAdmin.pkid, username, password, email);
            return res.status(200).json({ message: '관리자 회원가입이 완료되었습니다.' });
        }
    } catch (err) {
        console.error('회원가입 오류:', err);
        return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
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
                    photo_url: result.photo_url,
                    employee_num: result.employee_num,
                    department: result.department,
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
                    major: result.major,
                    isAdmin: false
                };
            }

            // 로그인 성공 시 메인으로 리다이렉트
            res.redirect('/');
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
            console.error("세션 삭제 실패:", error);
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
        let photoUrl;
        if (user.isAdmin) {
            photoUrl = `/uploads/admin/${req.file.filename}`;
            await model.updateAdminPhoto(user.pkid, photoUrl);
        } else {
            photoUrl = `/uploads/students/${req.file.filename}`;
            await model.updateStudentPhoto(user.pkid, photoUrl);
        }

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
        const user_role = user ? (user.isAdmin ? 'admin' : 'student') : 'guest';
        
        res.render('ViewAnnouncement', { announcement, isAdmin, user_role });
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
        
        const id = req.params.id || req.query.id || req.query.classId;
        if (!id) return res.status(400).send('수업 ID가 필요합니다.');
        
        // 먼저 해당 ID의 수업 정보를 가져와서 과목명을 확인
        const mainClassInfo = await model.getTimetableById(id, user.pkid);
        if (!mainClassInfo) return res.status(404).send('수업을 찾을 수 없습니다.');
        
        // 같은 과목명의 모든 시간표 항목 가져오기
        const allClassTimes = await model.getTimetablesByTitle(mainClassInfo.title, user.pkid);
        
        // 요일 변환
        const dayMap = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
        
        // 교시를 시간으로 변환
        const periodToTime = (period) => {
            const base = new Date(2000, 0, 1, 9, 0, 0);
            base.setMinutes(base.getMinutes() + (period - 1) * 60);
            return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
        };
        
        // 모든 시간대에 대해 요일과 시간 정보 추가
        const timeSlots = allClassTimes.map(slot => ({
            id: slot.id,
            dayName: dayMap[slot.day] || '',
            start_time: periodToTime(slot.start_period),
            end_time: periodToTime(slot.end_period + 1),
            location: slot.location || ''
        }));
        
        // 기본 정보는 첫 번째 항목 사용
        const classInfo = {
            id: mainClassInfo.id,
            title: mainClassInfo.title,
            color: mainClassInfo.color,
            memo: mainClassInfo.memo,
            professor: mainClassInfo.professor,
            credits: mainClassInfo.credits,
            timeSlots: timeSlots
        };
        
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
        
        const id = req.params.id || req.query.id || req.query.classId;
        console.log('modifyClass - req.params:', req.params);
        console.log('modifyClass - req.query:', req.query);
        console.log('modifyClass - id:', id);
        
        if (!id) return res.status(400).send('수업 ID가 필요합니다.');
        
        const classInfo = await model.getTimetableById(id, user.pkid);
        console.log('modifyClass - classInfo:', classInfo);
        
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

// 시간표 단일 조회 API (JSON)
const getClassApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
        
        const id = req.params.id;
        if (!id) return res.status(400).json({ ok: false, message: '수업 ID가 필요합니다.' });
        
        // 해당 수업 정보 가져오기
        const classInfo = await model.getTimetableById(id, user.pkid);
        if (!classInfo) return res.status(404).json({ ok: false, message: '수업을 찾을 수 없습니다.' });
        
        // 같은 과목명의 모든 시간표 슬롯 가져오기
        const allSlots = await model.getTimetablesByTitle(classInfo.title, user.pkid);
        
        // 요일 변환
        const dayMap = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
        
        // 교시를 시간으로 변환
        const periodToTime = (period) => {
            const base = new Date(2000, 0, 1, 9, 0, 0);
            base.setMinutes(base.getMinutes() + (period - 1) * 60);
            return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
        };
        
        // 슬롯 데이터 변환
        const slots = allSlots.map(slot => ({
            id: slot.id,
            day: dayMap[slot.day] || '',
            startTime: periodToTime(slot.start_period),
            endTime: periodToTime(slot.end_period + 1),
            place: slot.location || ''
        }));
        
        return res.json({
            ok: true,
            title: classInfo.title,
            color: classInfo.color || 'bg-blue-100',
            memo: classInfo.memo || '',
            professor: classInfo.professor || '',
            credits: classInfo.credits || '',
            slots: slots
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 시간표 상세 정보 조회 API (ModifyClass용)
const getClassDetailsApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
        
        const id = req.params.id;
        if (!id) return res.status(400).json({ ok: false, message: '수업 ID가 필요합니다.' });
        
        // 해당 수업 정보 가져오기
        const classInfo = await model.getTimetableById(id, user.pkid);
        if (!classInfo) return res.status(404).json({ ok: false, message: '수업을 찾을 수 없습니다.' });
        
        return res.json({
            ok: true,
            title: classInfo.title,
            color: classInfo.color || 'bg-blue-100',
            memo: classInfo.memo || '',
            professor: classInfo.professor || '',
            credits: classInfo.credits || ''
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 시간표 수정 API (JSON)
const updateClassApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
        
        const id = req.params.id;
        if (!id) return res.status(400).json({ ok: false, message: '수업 ID가 필요합니다.' });
        
        let { title, class_color, memo, professor, credits, slots } = req.body;
        
        title = common.reqeustFilter(title, 100, false);
        class_color = common.reqeustFilter(class_color || 'bg-blue-100', 30, false);
        memo = memo ? common.reqeustFilter(memo, 1000, false, '') : null;
        professor = professor ? common.reqeustFilter(professor, 100, false, '') : null;
        credits = credits ? parseInt(credits, 10) : null;
        
        if (!slots || !Array.isArray(slots) || slots.length === 0) {
            return res.status(400).json({ ok: false, message: '최소 하나의 시간 슬롯이 필요합니다.' });
        }
        
        // 시간을 교시로 변환하는 함수
        const timeToPeriod = (hhmm) => {
            const m = /^([0-2]?\d):(\d{2})$/.exec(hhmm || '');
            if (!m) return null;
            const hh = parseInt(m[1], 10);
            const mm = parseInt(m[2], 10);
            const totalMinutes = hh * 60 + mm;
            const baseMinutes = 9 * 60;
            const period = Math.floor((totalMinutes - baseMinutes) / 60) + 1;
            return (period >= 1 && period <= 20) ? period : null;
        };
        
        const dayMap = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5 };
        
        // 기존 같은 과목명의 모든 시간표 삭제
        const oldClass = await model.getTimetableById(id, user.pkid);
        if (!oldClass) return res.status(404).json({ ok: false, message: '수업을 찾을 수 없습니다.' });
        
        const allOldSlots = await model.getTimetablesByTitle(oldClass.title, user.pkid);
        for (const slot of allOldSlots) {
            await model.deleteTimetableEntry(slot.id, user.pkid);
        }
        
        // 새로운 슬롯들 추가
        let firstNewId = null;
        for (const slot of slots) {
            const day = dayMap[slot.day];
            const start_period = timeToPeriod(slot.startTime);
            const end_period = timeToPeriod(slot.endTime);
            
            if (!day || !start_period || !end_period) {
                return res.status(400).json({ ok: false, message: '잘못된 시간 형식입니다.' });
            }
            
            const location = common.reqeustFilter(slot.place || '', 100, false, '');
            
            const newId = await model.addTimetableEntry(
                user.pkid,
                day,
                start_period,
                end_period - 1, // end_period는 실제 마지막 교시
                title,
                location,
                class_color,
                memo,
                professor,
                credits
            );
            
            if (!firstNewId) firstNewId = newId;
        }
        
        return res.json({ ok: true, message: '수업이 수정되었습니다.', newClassId: firstNewId });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// 시간표 삭제 API (JSON)
const deleteClassApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
        
        const id = req.params.id;
        if (!id) return res.status(400).json({ ok: false, message: '수업 ID가 필요합니다.' });
        
        // 해당 수업 정보 가져오기
        const classInfo = await model.getTimetableById(id, user.pkid);
        if (!classInfo) return res.status(404).json({ ok: false, message: '수업을 찾을 수 없습니다.' });
        
        // 같은 과목명의 모든 시간표 슬롯 삭제
        const allSlots = await model.getTimetablesByTitle(classInfo.title, user.pkid);
        for (const slot of allSlots) {
            await model.deleteTimetableEntry(slot.id, user.pkid);
        }
        
        return res.json({ ok: true, message: '수업이 삭제되었습니다.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}

// ===== Helper: 현재 연도/학기 계산 =====
function getCurrentYearSemester() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1..12
    const semester = (month >= 3 && month <= 8) ? 1 : 2; // 3~8월: 1학기, 그 외: 2학기
    return { year, semester };
}

// 시간표 과목 리스트 (학점 포함) 반환
const getMyTimetableCoursesApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user || user.isAdmin) return res.status(401).json({ ok: false, message: '학생만 이용 가능합니다.' });
        const rows = await model.getUserTimetableCourses(user.pkid);
        return res.json(rows);
    } catch (err) {
        console.error('과목 목록 조회 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 성적 입력/수정 API
const addGradeApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user || user.isAdmin) return res.status(401).json({ ok: false, message: '학생만 이용 가능합니다.' });

        let { course_title, credits, grade, is_major } = req.body;
        if (!course_title || !grade) {
            return res.status(400).json({ ok: false, message: '과목명과 성적이 필요합니다.' });
        }
        credits = parseInt(credits, 10) || 0;
        is_major = is_major ? 1 : 0;

        // 현재 학기 기준으로 저장
        const { year, semester } = getCurrentYearSemester();
        await model.addOrUpdateGrade(user.pkid, year, semester, course_title, credits, grade, is_major);
        return res.json({ ok: true });
    } catch (err) {
        console.error('성적 저장 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 성적 요약 API (GPA/총 학점)
const getGradesSummaryApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user || user.isAdmin) return res.status(401).json({ ok: false, message: '학생만 이용 가능합니다.' });
        const grades = await model.getGradesByUser(user.pkid);

        const gradeToPoint = (grade) => {
            const map = { 'A+': 4.5, 'A0': 4.0, 'B+': 3.5, 'B0': 3.0, 'C+': 2.5, 'C0': 2.0, 'D+': 1.5, 'D0': 1.0, 'F': 0.0 };
            return map[grade] ?? null;
        };
        let totalEarnedCredits = 0, gpaCredits = 0, totalPoints = 0;
        let majorGpaCredits = 0, majorTotalPoints = 0;
        
        grades.forEach(g => {
            const pt = gradeToPoint(g.grade);
            const cr = g.credits || 0;
            if (pt !== null) { 
                gpaCredits += cr; 
                totalPoints += pt * cr;
                
                if (g.is_major) {
                    majorGpaCredits += cr;
                    majorTotalPoints += pt * cr;
                }
            }
            if (g.grade !== 'F') { totalEarnedCredits += cr; }
        });
        const overallGPA = gpaCredits > 0 ? (totalPoints / gpaCredits).toFixed(2) : '0.00';
        const majorGPA = majorGpaCredits > 0 ? (majorTotalPoints / majorGpaCredits).toFixed(2) : '0.00';
        return res.json({ ok: true, overallGPA, majorGPA, totalCredits: totalEarnedCredits });
    } catch (err) {
        console.error('요약 조회 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 성적 수정 API (PUT /api/grades/:id)
const updateGradeApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user || user.isAdmin) {
            return res.status(401).json({ ok: false, message: '학생만 이용 가능합니다.' });
        }

        const gradeId = parseInt(req.params.id, 10);
        if (!gradeId) {
            return res.status(400).json({ ok: false, message: '성적 ID가 필요합니다.' });
        }

        let { grade, is_major } = req.body;
        if (!grade) {
            return res.status(400).json({ ok: false, message: '성적이 필요합니다.' });
        }

        // 성적이 본인의 것인지 확인
        const existingGrade = await model.getGradeById(gradeId, user.pkid);
        if (!existingGrade) {
            return res.status(404).json({ ok: false, message: '성적을 찾을 수 없습니다.' });
        }

        // 성적 수정
        is_major = is_major ? 1 : 0;
        const affected = await model.updateGrade(gradeId, user.pkid, grade, is_major);
        
        if (affected === 0) {
            return res.status(404).json({ ok: false, message: '성적을 수정할 수 없습니다.' });
        }

        return res.json({ ok: true, message: '성적이 수정되었습니다.' });
    } catch (err) {
        console.error('성적 수정 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 성적 삭제 API (DELETE /api/grades/:id)
const deleteGradeApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user || user.isAdmin) {
            return res.status(401).json({ ok: false, message: '학생만 이용 가능합니다.' });
        }

        const gradeId = parseInt(req.params.id, 10);
        if (!gradeId) {
            return res.status(400).json({ ok: false, message: '성적 ID가 필요합니다.' });
        }

        // 성적이 본인의 것인지 확인
        const existingGrade = await model.getGradeById(gradeId, user.pkid);
        if (!existingGrade) {
            return res.status(404).json({ ok: false, message: '성적을 찾을 수 없습니다.' });
        }

        // 성적 삭제
        const affected = await model.deleteGrade(gradeId, user.pkid);
        
        if (affected === 0) {
            return res.status(404).json({ ok: false, message: '성적을 삭제할 수 없습니다.' });
        }

        return res.json({ ok: true, message: '성적이 삭제되었습니다.' });
    } catch (err) {
        console.error('성적 삭제 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// ============================================================
// 이메일 인증 및 비밀번호 재설정 API
// ============================================================

// 인증번호 발송 API
const sendVerificationCodeApi = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ ok: false, message: '이메일을 입력해주세요.' });
        }

        // 이메일로 사용자 찾기
        const user = await model.findUserByEmail(email);
        if (!user) {
            return res.status(404).json({ ok: false, message: '가입되지 않은 이메일입니다.' });
        }

        // 6자리 랜덤 인증번호 생성
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // DB에 인증번호 저장 (10분 유효)
        await model.saveVerificationCode(email, code, 10);

        // 이메일 발송
        const result = await mailer.sendVerificationCode(email, code);

        if (result.success) {
            return res.json({ ok: true, message: '인증번호가 발송되었습니다.' });
        } else {
            return res.status(500).json({ ok: false, message: '이메일 발송에 실패했습니다.' });
        }
    } catch (err) {
        console.error('인증번호 발송 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 인증번호 확인 API
const verifyCodeApi = async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ ok: false, message: '이메일과 인증번호를 입력해주세요.' });
        }

        // 인증번호 확인
        const isValid = await model.verifyCode(email, code);

        if (isValid) {
            // 인증 성공 시 비밀번호 재설정용 1회용 토큰 생성
            const token = await model.createPasswordResetToken(email);
            return res.json({ ok: true, token: token, message: '인증에 성공했습니다.' });
        } else {
            return res.status(400).json({ ok: false, message: '인증번호가 올바르지 않거나 만료되었습니다.' });
        }
    } catch (err) {
        console.error('인증번호 확인 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류가 발생했습니다.' });
    }
};

// 비밀번호 재설정 API
const resetPasswordApi = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ ok: false, message: '토큰과 비밀번호를 입력해주세요.' });
        }

        // 토큰 확인
        const tokenInfo = await model.verifyPasswordResetToken(token);

        if (!tokenInfo.valid) {
            return res.status(400).json({ ok: false, message: '토큰이 올바르지 않거나 만료되었습니다.' });
        }

        // 비밀번호 변경
        const success = await model.updatePassword(tokenInfo.email, password);

        if (success) {
            // 토큰 사용 처리
            await model.markTokenAsUsed(tokenInfo.tokenId);
            return res.json({ ok: true, message: '비밀번호가 성공적으로 변경되었습니다.' });
        } else {
            return res.status(500).json({ ok: false, message: '비밀번호 변경에 실패했습니다.' });
        }
    } catch (err) {
        console.error('비밀번호 재설정 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류가 발생했습니다.' });
    }
};

// ========== 알림 API ==========

// 일정 알림 스케줄링 함수
const scheduleEventNotifications = async (user_pkid, user_type, event_id, event_title, event_date, event_time, alarms) => {
    // 기존 타이머가 있으면 먼저 취소
    cancelEventNotifications(event_id);
    
    // 일정 시간 계산
    let eventDateTime;
    if (event_time) {
        eventDateTime = new Date(`${event_date}T${event_time}`);
    } else {
        // 시간이 없으면 당일 오전 9시로 설정
        eventDateTime = new Date(`${event_date}T09:00:00`);
    }
    
    const alarmOffsetMap = {
        '10m': 10 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '1w': 7 * 24 * 60 * 60 * 1000
    };
    
    const alarmTextMap = {
        '10m': '10분',
        '30m': '30분',
        '1h': '1시간',
        '12h': '12시간',
        '1d': '1일',
        '1w': '1주일'
    };
    
    const timers = [];
    
    for (const alarmOffset of alarms) {
        const offsetMs = alarmOffsetMap[alarmOffset];
        if (!offsetMs) continue;
        
        const notificationTime = new Date(eventDateTime.getTime() - offsetMs);
        const now = new Date();
        
        // 알림 시간이 현재보다 미래인 경우에만 스케줄링
        if (notificationTime > now) {
            const delay = notificationTime.getTime() - now.getTime();
            
            const timerId = setTimeout(async () => {
                try {
                    await model.createNotification(
                        user_pkid,
                        user_type,
                        'event',
                        '일정 알림',
                        `'${event_title}' ${alarmTextMap[alarmOffset]} 전입니다.`,
                        `/ViewEvent?eventId=${event_id}&type=private`
                    );
                } catch (err) {
                    console.error('일정 알림 전송 오류:', err);
                }
            }, delay);
            
            timers.push(timerId);
        }
    }
    
    // 타이머 ID들을 저장
    if (timers.length > 0) {
        eventNotificationTimers.set(event_id, timers);
    }
};

// 일정 알림 취소 함수
const cancelEventNotifications = (event_id) => {
    const timers = eventNotificationTimers.get(event_id);
    if (timers) {
        timers.forEach(timerId => clearTimeout(timerId));
        eventNotificationTimers.delete(event_id);
    }
};

// 알림 목록 조회 API
const getNotificationsApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        const userType = user.isAdmin ? 'admin' : 'student';
        const notifications = await model.getNotifications(user.pkid, userType);
        
        return res.json({ ok: true, notifications });
    } catch (err) {
        console.error('알림 목록 조회 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 미확인 알림 개수 조회 API
const getUnreadCountApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        const userType = user.isAdmin ? 'admin' : 'student';
        const count = await model.getUnreadNotificationCount(user.pkid, userType);
        
        return res.json({ ok: true, count });
    } catch (err) {
        console.error('미확인 알림 개수 조회 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 알림 읽음 처리 API
const markNotificationReadApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        const notificationId = parseInt(req.params.id, 10);
        if (!notificationId) {
            return res.status(400).json({ ok: false, message: '잘못된 알림 ID' });
        }

        const userType = user.isAdmin ? 'admin' : 'student';
        await model.markNotificationAsRead(notificationId, user.pkid, userType);
        
        return res.json({ ok: true });
    } catch (err) {
        console.error('알림 읽음 처리 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 모든 알림 읽음 처리 API
const markAllNotificationsReadApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        const userType = user.isAdmin ? 'admin' : 'student';
        await model.markAllNotificationsAsRead(user.pkid, userType);
        
        return res.json({ ok: true });
    } catch (err) {
        console.error('모든 알림 읽음 처리 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 모든 알림 삭제 API
const deleteAllNotificationsApi = async (req, res) => {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

        const userType = user.isAdmin ? 'admin' : 'student';
        await model.deleteAllNotifications(user.pkid, userType);
        
        return res.json({ ok: true });
    } catch (err) {
        console.error('모든 알림 삭제 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
};

// 바코드 생성 컨트롤러
const generateBarcode = (req, res) => {
    const text = req.params.text;
    if (!text) {
        return res.status(400).send('Barcode text is required');
    }
    bwipjs.toBuffer({
        bcid: 'code128',       // 바코드 타입
        text: text,            // 바코드에 인코딩할 텍스트
        scale: 3,              // 스케일
        height: 10,            // 높이
        includetext: true,     // 텍스트 포함 여부
        textxalign: 'center',  // 텍스트 정렬
    }, (err, png) => {
        if (err) {
            console.error("Barcode generation error:", err);
            return res.status(500).send('Error generating barcode');
        } else {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(png);
        }
    });
};

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
    viewEvent,
    modifyEvent,
    createPersonalEvent,
    getPersonalEventsApi,
    getEventByIdApi,
    updateEventApi,
    deleteEventApi,
    getAcademicScheduleApi,
    addClass,
    addClassProc,
    viewClass,
    modifyClass,
    getClassApi,
    getClassDetailsApi,
    updateClassApi,
    deleteClassApi,
    notifications,
    login,
    join,
    forgotPassword,
    verifyCode,
    resetPassword,
    registerProc,
    loginProc,
    logout,
    upload,
    uploadAnnouncement,
    getAllCoursesApi,
    getCourseSectionsApi,
    addCourseToTimetableApi,
    // grades/timetable related APIs
    getMyTimetableCoursesApi,
    addGradeApi,
    updateGradeApi,
    deleteGradeApi,
    getGradesSummaryApi,
    // email verification APIs
    sendVerificationCodeApi,
    verifyCodeApi,
    resetPasswordApi,
    generateBarcode,
    // notification APIs
    getNotificationsApi,
    getUnreadCountApi,
    markNotificationReadApi,
    markAllNotificationsReadApi,
    deleteAllNotificationsApi
}

// 일정 수정 API
async function updateEventApi(req, res) {
    try {
        const user = req.session && req.session.user;
        if (!user) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

    const eventId = parseInt(req.params.id, 10);
    const typeRaw = (req.query.type || req.body.event_type || 'personal').toLowerCase();
    const eventType = (typeRaw === 'public') ? 'academic' : (typeRaw === 'private' ? 'personal' : typeRaw);
        if (!eventId) return res.status(400).json({ ok: false, message: '잘못된 일정 ID' });

        const title = common.reqeustFilter(req.body.title, 255, false);
        if (!title) return res.status(400).json({ ok: false, message: '제목이 필요합니다.' });

        if (eventType === 'academic') {
            // 관리자만 수정 가능
            if (!user.isAdmin) return res.status(403).json({ ok: false, message: '권한이 없습니다.' });
            let start_date = common.reqeustFilter(req.body.start_date, 20, false);
            let end_date = common.reqeustFilter(req.body.end_date, 20, false);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
                return res.status(400).json({ ok: false, message: '잘못된 날짜 형식' });
            }
            if (new Date(start_date) > new Date(end_date)) {
                return res.status(400).json({ ok: false, message: '종료일은 시작일보다 빠를 수 없습니다.' });
            }
            await model.updateAcademicSchedule(eventId, title, start_date, end_date);
            return res.json({ ok: true });
        } else {
            // 개인 일정: 본인 것만 수정
            const userType = user.isAdmin ? 'admin' : 'student';
            // 존재 확인
            const existing = await model.getPersonalEventById(eventId, user.pkid, userType);
            if (!existing) return res.status(404).json({ ok: false, message: '일정을 찾을 수 없습니다.' });

            // 알림 데이터 파싱
            let alarmsArray = [];
            if (req.body.alarms) {
                try {
                    alarmsArray = JSON.parse(req.body.alarms);
                } catch (e) {
                    alarmsArray = [];
                }
            }

            let event_date = common.reqeustFilter(req.body.event_date, 20, false);
            let event_time = req.body.event_time;
            let memo = req.body.memo ? common.reqeustFilter(req.body.memo, 1000, false, '') : null;
            let event_color = common.reqeustFilter(req.body.event_color, 30, false);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
                return res.status(400).json({ ok: false, message: '잘못된 날짜 형식' });
            }
            if (event_time && event_time.trim()) {
                event_time = common.reqeustFilter(event_time, 20, false);
                if (!/^\d{2}:\d{2}(:\d{2})?$/.test(event_time)) {
                    return res.status(400).json({ ok: false, message: '잘못된 시간 형식' });
                }
            } else {
                event_time = null;
            }
            if (!/^bg-(red|blue|green|yellow)-(100|200|300|400|500|600|700|800|900)$/.test(event_color)) {
                return res.status(400).json({ ok: false, message: '허용되지 않는 색상' });
            }
            await model.updatePersonalEvent(eventId, user.pkid, userType, title, event_date, event_time, event_color, memo, alarmsArray);
            
            // 알림이 있다면 다시 스케줄링
            if (alarmsArray && alarmsArray.length > 0) {
                scheduleEventNotifications(user.pkid, userType, eventId, title, event_date, event_time, alarmsArray);
            }
            
            return res.json({ ok: true });
        }
    } catch (err) {
        console.error('일정 수정 오류:', err);
        return res.status(500).json({ ok: false, message: '서버 오류' });
    }
}