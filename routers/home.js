const express = require("express");
const router = express.Router();

router.get("/", (req, res) => { // 첫 페이지
    res.render('Main');
});

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

module.exports = {
    router
}