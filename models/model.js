const db = require('../common/db');

const loginCheck = async (student_num, student_pw) => {
    try {
        const sql = "select pkid, name from student where student_num = ? and student_pw = ?;";
        const params = [student_num, student_pw];

        const result = await db.runSql(sql, params);
        return result[0];
    } catch {
        throw "sql error";
    }
}

// 공지 목록 조회
const getAnnouncements = async () => {
    try {
        const sql = "SELECT pkid, title, content, category, author_pkid, created_at FROM announcements ORDER BY created_at DESC;";
        const result = await db.runSql(sql);
        return result;
    } catch (err) {
        throw err;
    }
}

// 공지 생성
const createAnnouncement = async (title, content, author_pkid, category = '일반') => {
    try {
        const sql = "INSERT INTO announcements (title, content, category, author_pkid, created_at) VALUES (?, ?, ?, ?, NOW());";
        const params = [title, content, category, author_pkid];
        const result = await db.runSql(sql, params);
        return result.insertId;
    } catch (err) {
        throw err;
    }
}

module.exports = {
    loginCheck,
    getAnnouncements,
    createAnnouncement
}