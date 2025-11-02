const express = require("express");
const router = express.Router();
const controller = require("../controllers/controller");

// 로그인 관련 라우트는 세션 검사 없이 접근 가능
router.get("/Login", controller.login);
router.post("/Login", controller.loginProc);
router.get("/Logout", controller.logout);

// 인증 미들웨어: 세션에 user가 없으면 로그인 페이지로 이동
const requireLogin = (req, res, next) => {
    if (req.session && req.session.user) return next();
    return res.redirect('/Login');
};

// 이후 라우트는 모두 인증 필요
router.use(requireLogin);

router.get("/", controller.main);
router.get("/Main", controller.main);
router.get("/Calendar", controller.calendar);
router.get("/Announcement", controller.announcement);
router.get("/AnnouncementAdmin", controller.announcementAdmin);
router.get("/AnnouncementGuest", controller.announcementGuest);
router.get("/CreateAnnouncement", controller.addAnnouncement);
router.post("/CreateAnnouncement", controller.createAnnouncement);
router.get("/Calculator", controller.calculator);
router.get("/Timetable", controller.timetable);
router.get("/MyPage", controller.myPage);
router.get("/AddEvent", controller.addEvent);
router.post("/AddEvent", controller.createPersonalEvent);
router.get("/AddClass", controller.addClass);
router.post("/AddClass", controller.addClassProc);
// 개인 일정 API
router.get("/api/events", controller.getPersonalEventsApi);

module.exports = {
    router
}