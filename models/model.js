const db = require('../common/db');

const loginCheck = async (student_num, student_pw) => {
    try {
        const sql = "select pkid, name, student_num from student where student_num = ? and student_pw = ?;";
        const params = [student_num, student_pw];

        const result = await db.runSql(sql, params);
        return result[0];
    } catch {
        throw "sql error";
    }
}

// 관리자 로그인 체크
const adminLoginCheck = async (admin_id, admin_pw) => {
    try {
        const sql = "select pkid, name, admin_id, role from administrator where admin_id = ? and admin_pw = ?;";
        const params = [admin_id, admin_pw];

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
// 최근 공지 N개 조회 (기본 5개)
const getRecentAnnouncements = async (limit = 5) => {
    try {
        const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 5));
        const sql = `SELECT pkid, title, content, category, author_pkid, created_at FROM announcements ORDER BY created_at DESC LIMIT ${lim}`;
        const result = await db.runSql(sql);
        return result;
    } catch (err) {
        throw err;
    }
}

// 공지 상세 조회
const getAnnouncementById = async (pkid) => {
    try {
        const sql = `
            SELECT a.pkid, a.title, a.content, a.category, a.author_pkid, a.created_at, s.name as author_name
            FROM announcements a
            LEFT JOIN student s ON a.author_pkid = s.pkid
            WHERE a.pkid = ?;
        `;
        const result = await db.runSql(sql, [pkid]);
        return result[0];
    } catch (err) {
        throw err;
    }
}

// 공지 수정
const updateAnnouncement = async (pkid, title, content, category) => {
    try {
        const sql = `
            UPDATE announcements 
            SET title = ?, content = ?, category = ?
            WHERE pkid = ?;
        `;
        const params = [title, content, category, pkid];
        const result = await db.runSql(sql, params);
        return result.affectedRows;
    } catch (err) {
        throw err;
    }
}

// 공지 삭제
const deleteAnnouncement = async (pkid) => {
    try {
        const sql = "DELETE FROM announcements WHERE pkid = ?;";
        const result = await db.runSql(sql, [pkid]);
        return result.affectedRows;
    } catch (err) {
        throw err;
    }
}

    const ensurePersonalEventsTable = async () => {
        const createSql = `
            CREATE TABLE IF NOT EXISTS personal_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_pkid INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                event_date DATE NOT NULL,
                event_time TIME NULL,
                color VARCHAR(32) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_date (user_pkid, event_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await db.runSql(createSql);
        
        // 기존 테이블의 event_time 컬럼이 NULL을 허용하지 않을 수 있으므로 수정
        try {
            const alterSql = `ALTER TABLE personal_events MODIFY event_time TIME NULL;`;
            await db.runSql(alterSql);
        } catch (err) {
            // 이미 NULL이 허용되거나 다른 이유로 실패하면 무시
            console.log('event_time column alter skipped:', err.message);
        }
    }

    const createPersonalEvent = async (user_pkid, title, event_date, event_time, color) => {
        await ensurePersonalEventsTable();
        const sql = `
            INSERT INTO personal_events (user_pkid, title, event_date, event_time, color)
            VALUES (?, ?, ?, ?, ?);
        `;
        const params = [user_pkid, title, event_date, event_time, color];
        const result = await db.runSql(sql, params);
        return result.insertId;
    }

    const getPersonalEventsByMonth = async (user_pkid, year, month1to12) => {
        await ensurePersonalEventsTable();
        const ym = `${year}-${String(month1to12).padStart(2,'0')}`;
        const sql = `
            SELECT id, title, color, DAY(event_date) AS day, TIME_FORMAT(event_time, '%H:%i') AS time
            FROM personal_events
            WHERE user_pkid = ? AND DATE_FORMAT(event_date, '%Y-%m') = ?
            ORDER BY event_date ASC, event_time ASC, id ASC;
        `;
        const params = [user_pkid, ym];
        const rows = await db.runSql(sql, params);
        return rows.map(r => ({ id: r.id, title: r.title, color: r.color, day: r.day, time: r.time }));
    }

    const getTodayPersonalEvents = async (user_pkid, date) => {
        await ensurePersonalEventsTable();
        const sql = `
            SELECT id, title, color, TIME_FORMAT(event_time, '%H:%i') AS time
            FROM personal_events
            WHERE user_pkid = ? AND event_date = ?
            ORDER BY event_time ASC, id ASC;
        `;
        const params = [user_pkid, date];
        const rows = await db.runSql(sql, params);
        return rows.map(r => ({ id: r.id, title: r.title, color: r.color, time: r.time }));
    }

    const getTodayTimetable = async (user_pkid, dayOfWeek) => {
        await ensureTimetableTable();
        const sql = `
            SELECT id, start_period, end_period, title, location, color
            FROM timetable_entries
            WHERE user_pkid = ? AND day = ?
            ORDER BY start_period ASC, end_period DESC, id ASC;
        `;
        const params = [user_pkid, dayOfWeek];
        const rows = await db.runSql(sql, params);
        return rows;
    }

module.exports = {
    loginCheck,
    adminLoginCheck,
    getAnnouncements,
    getRecentAnnouncements,
    getAnnouncementById,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    createPersonalEvent,
    getPersonalEventsByMonth,
    getTodayPersonalEvents,
    getTodayTimetable,
    // timetable will be appended below
}

// ==== Timetable (classes) ====
const ensureTimetableTable = async () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS timetable_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_pkid INT NOT NULL,
            day TINYINT NOT NULL, -- 1=Mon .. 5=Fri
            start_period TINYINT NOT NULL,
            end_period TINYINT NOT NULL,
            title VARCHAR(100) NOT NULL,
            location VARCHAR(100) NULL,
            color VARCHAR(32) NOT NULL DEFAULT 'bg-blue-100',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_day (user_pkid, day)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await db.runSql(sql);
}

const addTimetableEntry = async (user_pkid, day, start_period, end_period, title, location, color) => {
    await ensureTimetableTable();
    const sql = `
        INSERT INTO timetable_entries (user_pkid, day, start_period, end_period, title, location, color)
        VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [user_pkid, day, start_period, end_period, title, location, color];
    const result = await db.runSql(sql, params);
    return result.insertId;
}

const getTimetableByUser = async (user_pkid) => {
    await ensureTimetableTable();
    const sql = `
        SELECT id, day, start_period, end_period, title, location, color
        FROM timetable_entries
        WHERE user_pkid = ?
        ORDER BY day ASC, start_period ASC, end_period DESC, id ASC;
    `;
    const rows = await db.runSql(sql, [user_pkid]);
    return rows;
}

const getTimetableById = async (id, user_pkid) => {
    await ensureTimetableTable();
    const sql = `
        SELECT id, day, start_period, end_period, title, location, color
        FROM timetable_entries
        WHERE id = ? AND user_pkid = ?;
    `;
    const result = await db.runSql(sql, [id, user_pkid]);
    return result[0];
}

const updateTimetableEntry = async (id, user_pkid, day, start_period, end_period, title, location, color) => {
    await ensureTimetableTable();
    const sql = `
        UPDATE timetable_entries
        SET day = ?, start_period = ?, end_period = ?, title = ?, location = ?, color = ?
        WHERE id = ? AND user_pkid = ?;
    `;
    const params = [day, start_period, end_period, title, location, color, id, user_pkid];
    const result = await db.runSql(sql, params);
    return result.affectedRows;
}

const deleteTimetableEntry = async (id, user_pkid) => {
    await ensureTimetableTable();
    const sql = "DELETE FROM timetable_entries WHERE id = ? AND user_pkid = ?;";
    const result = await db.runSql(sql, [id, user_pkid]);
    return result.affectedRows;
}

module.exports.ensureTimetableTable = ensureTimetableTable;
module.exports.addTimetableEntry = addTimetableEntry;
module.exports.getTimetableByUser = getTimetableByUser;
module.exports.getTimetableById = getTimetableById;
module.exports.updateTimetableEntry = updateTimetableEntry;
module.exports.deleteTimetableEntry = deleteTimetableEntry;