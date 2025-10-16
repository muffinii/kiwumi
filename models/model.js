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

module.exports = {
    loginCheck
}