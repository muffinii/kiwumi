const express = require("express");
const router = express.Router();
const controller = require("../controllers/controller");

router.get("/", controller.main);

router.get("/Main", (req, res) => {
    res.render("Main");
});

router.get("/Calendar", (req, res) => {
    res.render("Calendar");
});

router.get("/Announcement", (req, res) => {
    res.render("Announcement");
});

router.get("/Calculator", (req, res) => {
    res.render("Calculator");
});


router.get("/Timetable", (req, res) => {
    res.render("Timetable");
});

router.get("/MyPage", (req, res) => {
    res.render("MyPage");
});

router.get("/AddEvent", (req, res) => {
    res.render("AddEvent");
});

router.get("/Announcement", (req, res) => {
    res.render("Announcement");
});

router.get("/Login", controller.login);
router.post("/Login", controller.loginProc);

module.exports = {
    router
}