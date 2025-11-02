const model = require('../models/model');
const common = require('../common/common');

const main = async (req, res) => {
    try {
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
        res.render('Main', { announcements });
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

const announcement = (req, res) => {
    try {
        res.render('Announcement');
    } catch {
        res.status(500).send("500 Error");
    }
}

// 관리자용 공지 목록
const announcementAdmin = async (req, res) => {
    try {
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
        res.render('AnnouncementAdmin', { announcements: formatted });
    } catch (err) {
        console.error(err);
        res.status(500).send('500 Error');
    }
}

// 게스트용 공지 목록
const announcementGuest = async (req, res) => {
    try {
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
        res.render('AnnouncementGuest', { announcements: formatted });
    } catch (err) {
        console.error(err);
        res.status(500).send('500 Error');
    }
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

        // 최대 교시 결정 (데이터가 없으면 기본 8교시까지 표시)
        let maxPeriod = Math.min(15, Math.max(8, ...(entries.map(e => e.end_period)), 0));
        if (!isFinite(maxPeriod) || maxPeriod <= 0) maxPeriod = 8;

        // 교시별 시작 시각 계산 함수
        const periodStartLabel = (p) => {
            // 1교시=09:00, 2~8교시는 1시간 간격, 9교시부터는 50분 간격
            if (p <= 8) {
                const base = new Date(2000,0,1,9,0,0);
                base.setMinutes(base.getMinutes() + (p-1)*60);
                const hh = String(base.getHours()).padStart(2,'0');
                const mm = String(base.getMinutes()).padStart(2,'0');
                return `${hh}:${mm}`;
            } else {
                const base = new Date(2000,0,1,17,0,0);
                base.setMinutes(base.getMinutes() + (p-9)*50);
                const hh = String(base.getHours()).padStart(2,'0');
                const mm = String(base.getMinutes()).padStart(2,'0');
                return `${hh}:${mm}`;
            }
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
        res.render('MyPage');
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

// 시간 문자열을 교시로 변환하는 헬퍼 (규칙: 1~8교시=1시간 간격 09:00 시작, 9교시부터 50분 간격 17:00 시작)
const timeToPeriod = (hhmm) => {
    const m = /^([0-2]?\d):(\d{2})$/.exec(hhmm || '');
    if (!m) return null;
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    // 09:00 ~ 16:00 정시 => 1~8교시 시작
    if (h >= 9 && h <= 16) {
        if (min !== 0) return null; // 교시 경계만 허용
        return (h - 9) + 1; // 9시=>1교시
    }
    // 17:00 이후 => 50분 간격
    if (h >= 17 && h <= 22) {
        const totalMin = (h - 17) * 60 + min; // 17:00 기준 경과 분
        if (totalMin % 50 !== 0) return null;
        const k = totalMin / 50; // 0,1,2,...
        const p = 9 + k;
        if (p < 9 || p > 15) return null;
        return p;
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
            if (ep < sp || sp < 1 || ep > 15) continue;

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

        const result = await model.loginCheck(student_num, student_pw);

        if(result != null) {
            // 로그인처리 ==> 세션 저장
            req.session.user = {
                pkid: result.pkid,
                name: result.name,
                student_num: student_num
            };

            // 로그인 성공 시 메인으로 리다이렉트
            common.alertAndGo(res, '로그인 되었습니다.', '/');
        } else {
            // 아이디 또는 비번이 틀린 경우
            res.send('<script>alert("학번 또는 비밀번호가 잘못되었습니다."); location.href="/Login";</script>');
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

module.exports = {
    main,
    calendar,
    announcement,
    announcementAdmin,
    announcementGuest,
    addAnnouncement,
    createAnnouncement,
    calculator,
    timetable,
    myPage,
    addEvent,
    createPersonalEvent,
    getPersonalEventsApi,
    addClass,
    addClassProc,
    login,
    loginProc,
    logout
}