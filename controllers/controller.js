const model = require('../models/model');
const common = require('../common/common');

const main = (req, res) => {
    try {
        res.render('Main');
    } catch {
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

const timetable = (req, res) => {
    try {
        res.render('Timetable');
    } catch {
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
    login,
    loginProc,
    logout
}