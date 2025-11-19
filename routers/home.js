
const express = require("express");
const router = express.Router();
const controller = require("../controllers/controller");
// AI 챗봇 페이지 및 API
router.get('/Chatbot', controller.chatbotPage);
router.post('/api/chatbot', controller.chatbotApi);

// 로그인 관련 라우트는 세션 검사 없이 접근 가능
router.get("/Login", controller.login);
router.post("/Login", controller.loginProc);
router.get("/Join", controller.join);
router.get("/ForgotPassword", controller.forgotPassword);
router.get("/VerifyCode", controller.verifyCode);
router.get("/ResetPassword", controller.resetPassword);
router.post("/api/auth/register", controller.registerProc);
router.post("/api/auth/send-code", controller.sendVerificationCodeApi);
router.post("/api/auth/verify-code", controller.verifyCodeApi);
router.post("/api/auth/reset-password", controller.resetPasswordApi);
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
router.post("/CreateAnnouncement", controller.uploadAnnouncement.array('attachment_file', 5), controller.createAnnouncement);
router.get("/ViewAnnouncement/:id", controller.viewAnnouncement);
router.get("/ViewAnnouncement", controller.viewAnnouncement);
router.get("/download/announcement/:filename", controller.downloadAnnouncementFile);
router.get("/ModifyAnnouncement/:id", controller.modifyAnnouncement);
router.get("/ModifyAnnouncement", controller.modifyAnnouncement);
router.post("/ModifyAnnouncement/:id", controller.modifyAnnouncementProc);
router.post("/ModifyAnnouncement", controller.modifyAnnouncementProc);
router.post("/DeleteAnnouncement/:id", controller.deleteAnnouncementProc);
router.post("/DeleteAnnouncement", controller.deleteAnnouncementProc);
router.get("/Calculator", controller.calculator);
router.get("/Timetable", controller.timetable);
router.get("/MyPage", controller.myPage);
router.post("/UploadPhoto", controller.upload.single('student_photo'), controller.uploadPhotoProc);
router.get("/AddEvent", controller.addEvent);
router.post("/AddEvent", controller.createPersonalEvent);
router.get("/ViewEvent", controller.viewEvent);
router.get("/ModifyEvent", controller.modifyEvent);
router.get("/AddClass", controller.addClass);
router.post("/AddClass", controller.addClassProc);
router.get("/api/all-courses", controller.getAllCoursesApi);
router.get("/api/course/:courseId/sections", controller.getCourseSectionsApi);
router.post("/api/timetable/add", controller.addCourseToTimetableApi);
router.get("/ViewClass/:id", controller.viewClass);
router.get("/ViewClass", controller.viewClass);
router.get("/ModifyClass/:id", controller.modifyClass);
router.get("/ModifyClass", controller.modifyClass);
router.get("/Notifications", controller.notifications);
// 개인 일정 API
router.get("/api/events", controller.getPersonalEventsApi);
router.get("/api/events/:id", controller.getEventByIdApi);
router.put("/api/events/:id", controller.updateEventApi);
router.delete("/api/events/:id", controller.deleteEventApi);
// 학사일정 API
router.get("/api/academic-schedule", controller.getAcademicScheduleApi);
// 시간표 API
router.get("/api/classes/:id", controller.getClassApi);
router.get("/api/classes/:id/details", controller.getClassDetailsApi);
router.get("/api/classes/:classId/sections", controller.getCourseSectionsApi);
router.put("/api/classes/:id", controller.updateClassApi);
router.delete("/api/classes/:id", controller.deleteClassApi);

// 바코드 생성 라우트
router.get('/barcode/:text', controller.generateBarcode);

// 학점/시간표 관련 API
router.get('/api/my-timetable-courses', controller.getMyTimetableCoursesApi);
router.post('/api/grades', controller.addGradeApi);
router.put('/api/grades/:id', controller.updateGradeApi);
router.delete('/api/grades/:id', controller.deleteGradeApi);
router.get('/api/grades/summary', controller.getGradesSummaryApi);

// 알림 관련 API
router.get('/api/notifications', controller.getNotificationsApi);
router.get('/api/notifications/unread-count', controller.getUnreadCountApi);
router.put('/api/notifications/:id/read', controller.markNotificationReadApi);
router.put('/api/notifications/read-all', controller.markAllNotificationsReadApi);
router.delete('/api/notifications/delete-all', controller.deleteAllNotificationsApi);

module.exports = {
    router
}