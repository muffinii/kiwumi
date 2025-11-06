const db = require('../common/db');

// student 테이블에 photo_url 컬럼 추가
const ensureStudentPhotoColumn = async () => {
    try {
        const alterSql = `ALTER TABLE student ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) NULL;`;
        await db.runSql(alterSql);
    } catch (err) {
        // MySQL 5.x에서는 IF NOT EXISTS를 지원하지 않으므로 에러 무시
        if (!err.message.includes('Duplicate column name')) {
            console.log('photo_url column alter skipped:', err.message);
        }
    }
}

// administrator 테이블에 필요한 컬럼 추가
const ensureAdminColumns = async () => {
    try {
        // photo_url 컬럼 추가
        await db.runSql('ALTER TABLE administrator ADD COLUMN photo_url VARCHAR(500) NULL;');
    } catch (err) {
        if (!err.message.includes('Duplicate column name')) {
            console.log('administrator photo_url column alter skipped:', err.message);
        }
    }
    
    try {
        // employee_num 컬럼 추가 (사번)
        await db.runSql('ALTER TABLE administrator ADD COLUMN employee_num VARCHAR(50) NULL;');
    } catch (err) {
        if (!err.message.includes('Duplicate column name')) {
            console.log('administrator employee_num column alter skipped:', err.message);
        }
    }
    
    try {
        // department 컬럼 추가 (부서)
        await db.runSql('ALTER TABLE administrator ADD COLUMN department VARCHAR(100) NULL;');
    } catch (err) {
        if (!err.message.includes('Duplicate column name')) {
            console.log('administrator department column alter skipped:', err.message);
        }
    }
}

const loginCheck = async (identifier, student_pw) => {
    // identifier: 학번 또는 아이디(학생용)
    try {
        // 우선 student_id(아이디) 컬럼이 있다고 가정하고 학번/아이디 둘 다 매칭 시도
        const sql = `
            SELECT pkid, name, student_num, photo_url, is_fee_paid, major
            FROM student
            WHERE (student_num = ? OR student_id = ?) AND student_pw = ?;
        `;
        const params = [identifier, identifier, student_pw];
        const result = await db.runSql(sql, params);
        return result[0];
    } catch (err) {
        // 호환성: student_id 컬럼이 없는 기존 스키마면 학번만으로 재시도
        if (String(err.message || '').includes('Unknown column') || String(err.sqlMessage || '').includes('Unknown column')) {
            const fallbackSql = `
                SELECT pkid, name, student_num, photo_url, is_fee_paid, major
                FROM student
                WHERE student_num = ? AND student_pw = ?;
            `;
            const fallbackParams = [identifier, student_pw];
            const result = await db.runSql(fallbackSql, fallbackParams);
            return result[0];
        }
        throw err;
    }
}

// 관리자 로그인 체크
const adminLoginCheck = async (admin_id, admin_pw) => {
    try {
        await ensureAdminColumns();
        const sql = "SELECT pkid, name, admin_id, role, photo_url, employee_num, department FROM administrator WHERE admin_id = ? AND admin_pw = ?;";
        const params = [admin_id, admin_pw];

        const result = await db.runSql(sql, params);
        return result[0];
    } catch {
        throw "sql error";
    }
}

// 회원가입: 이름과 학번으로 사전 등록된 학생 확인
const checkPreRegisteredStudent = async (name, student_num) => {
    try {
        const sql = `
            SELECT pkid, name, student_num, major
            FROM student
            WHERE name = ? AND student_num = ?;
        `;
        const params = [name, student_num];
        const result = await db.runSql(sql, params);
        return result[0]; // 있으면 학생 정보 반환, 없으면 undefined
    } catch (err) {
        console.error('사전 등록 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 이미 가입된 계정인지 확인 (regdate 또는 실제 이메일 존재 여부로 판단)
const checkStudentAlreadyRegistered = async (student_pkid) => {
    try {
        const sql = `
            SELECT student_id, email
            FROM student
            WHERE pkid = ? 
              AND email NOT LIKE '%@temp.placeholder' 
              AND student_id != 'temp_id';
        `;
        const params = [student_pkid];
        const result = await db.runSql(sql, params);
        return result.length > 0; // 실제 이메일이 있으면 이미 가입된 것으로 판단
    } catch (err) {
        console.error('가입 여부 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 아이디 중복 체크
const checkUsernameExists = async (username) => {
    try {
        const sql = `
            SELECT pkid
            FROM student
            WHERE student_id = ? AND student_id != 'temp_id';
        `;
        const params = [username];
        const result = await db.runSql(sql, params);
        return result.length > 0; // 이미 있으면 true
    } catch (err) {
        console.error('아이디 중복 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 이메일 중복 체크
const checkEmailExists = async (email) => {
    try {
        const sql = `
            SELECT pkid
            FROM student
            WHERE email = ? AND email NOT LIKE '%@temp.placeholder';
        `;
        const params = [email];
        const result = await db.runSql(sql, params);
        return result.length > 0; // 이미 있으면 true
    } catch (err) {
        console.error('이메일 중복 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 학생 정보 업데이트 (student_id, student_pw, email, phone_number 등)
const updateStudentRegistration = async (student_pkid, username, password, email, phone) => {
    try {
        const sql = `
            UPDATE student
            SET student_id = ?, student_pw = ?, email = ?, phone_number = ?
            WHERE pkid = ?;
        `;
        const params = [username, password, email, phone, student_pkid];
        await db.runSql(sql, params);
    } catch (err) {
        console.error('학생 정보 업데이트 오류:', err);
        throw err;
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
const createAnnouncement = async (title, content, author_pkid, category = '일반', attachments = null) => {
    try {
        const sql = "INSERT INTO announcements (title, content, category, author_pkid, attachments, created_at) VALUES (?, ?, ?, ?, ?, NOW());";
        const params = [title, content, category, author_pkid, attachments];
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
            SELECT a.pkid, a.title, a.content, a.category, a.author_pkid, a.created_at, a.attachments, s.name as author_name
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
                user_type ENUM('student', 'admin') NOT NULL DEFAULT 'student',
                title VARCHAR(255) NOT NULL,
                event_date DATE NOT NULL,
                event_time TIME NULL,
                color VARCHAR(32) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_date (user_pkid, user_type, event_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await db.runSql(createSql);
    }

    const createPersonalEvent = async (user_pkid, user_type, title, event_date, event_time, color) => {
        await ensurePersonalEventsTable();
        const sql = `
            INSERT INTO personal_events (user_pkid, user_type, title, event_date, event_time, color)
            VALUES (?, ?, ?, ?, ?, ?);
        `;
        const params = [user_pkid, user_type, title, event_date, event_time, color];
        const result = await db.runSql(sql, params);
        return result.insertId;
    }

    const getPersonalEventsByMonth = async (user_pkid, user_type, year, month1to12) => {
        await ensurePersonalEventsTable();
        const sql = `
            SELECT id, DAY(event_date) as day, title, color, TIME_FORMAT(event_time, '%H:%i') as time
            FROM personal_events
            WHERE user_pkid = ? AND user_type = ? AND YEAR(event_date) = ? AND MONTH(event_date) = ?
            ORDER BY event_date, event_time;
        `;
        const params = [user_pkid, user_type, year, month1to12];
        const rows = await db.runSql(sql, params);
        return rows;
    }

// 개인 일정 상세 조회
const getPersonalEventById = async (event_id, user_pkid, user_type) => {
    await ensurePersonalEventsTable();
    const sql = `
        SELECT id, title, DATE_FORMAT(event_date, '%Y-%m-%d') as event_date, 
               TIME_FORMAT(event_time, '%H:%i') as event_time, color
        FROM personal_events
        WHERE id = ? AND user_pkid = ? AND user_type = ?;
    `;
    const params = [event_id, user_pkid, user_type];
    const result = await db.runSql(sql, params);
    return result[0];
}

// 개인 일정 삭제
const deletePersonalEvent = async (event_id, user_pkid, user_type) => {
    await ensurePersonalEventsTable();
    const sql = `
        DELETE FROM personal_events
        WHERE id = ? AND user_pkid = ? AND user_type = ?;
    `;
    const params = [event_id, user_pkid, user_type];
    await db.runSql(sql, params);
}

// 개인 일정 수정
const updatePersonalEvent = async (event_id, user_pkid, user_type, title, event_date, event_time, color) => {
    await ensurePersonalEventsTable();
    const sql = `
        UPDATE personal_events
        SET title = ?, event_date = ?, event_time = ?, color = ?
        WHERE id = ? AND user_pkid = ? AND user_type = ?;
    `;
    const params = [title, event_date, event_time, color, event_id, user_pkid, user_type];
    await db.runSql(sql, params);
}

// 학사일정 월별 조회
const getAcademicScheduleByMonth = async (year, month1to12) => {
    try {
        const sql = `
            SELECT id, title, 
                   DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
                   DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
                   source_url, campus
            FROM academic_schedule
            WHERE (YEAR(start_date) = ? AND MONTH(start_date) = ?)
               OR (YEAR(end_date) = ? AND MONTH(end_date) = ?)
               OR (start_date <= ? AND end_date >= ?)
            ORDER BY start_date ASC;
        `;
        // 해당 월의 첫날과 마지막날
        const firstDay = `${year}-${String(month1to12).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month1to12, 0).getDate();
        const lastDayStr = `${year}-${String(month1to12).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        
        const params = [year, month1to12, year, month1to12, lastDayStr, firstDay];
        const rows = await db.runSql(sql, params);
        return rows;
    } catch (err) {
        console.error('학사일정 조회 오류:', err);
        return [];
    }
}

// 학사일정 생성
const createAcademicSchedule = async (title, start_date, end_date, campus = null, source_url = null) => {
    const sql = `
        INSERT INTO academic_schedule (title, start_date, end_date, campus, source_url)
        VALUES (?, ?, ?, ?, ?);
    `;
    const params = [title, start_date, end_date, campus, source_url];
    const result = await db.runSql(sql, params);
    return result.insertId;
}

// 학사일정 상세 조회
const getAcademicScheduleById = async (event_id) => {
    const sql = `
        SELECT id, title,
               DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
               DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
               campus, source_url
        FROM academic_schedule
        WHERE id = ?;
    `;
    const params = [event_id];
    const result = await db.runSql(sql, params);
    return result[0];
}

// 학사일정 삭제
const deleteAcademicSchedule = async (event_id) => {
    const sql = `
        DELETE FROM academic_schedule
        WHERE id = ?;
    `;
    const params = [event_id];
    await db.runSql(sql, params);
}

// 학사일정 수정
const updateAcademicSchedule = async (event_id, title, start_date, end_date) => {
    const sql = `
        UPDATE academic_schedule
        SET title = ?, start_date = ?, end_date = ?
        WHERE id = ?;
    `;
    const params = [title, start_date, end_date, event_id];
    await db.runSql(sql, params);
}

// 시간표 조회
const getTimetablesByPkid = async (user_pkid) => {
    await ensureTimetableTable();
    const sql = `
        SELECT id, day, start_period, end_period, title, location, color, memo
        FROM timetable_entries
        WHERE user_pkid = ? AND user_type = 'student'
        ORDER BY day ASC, start_period ASC, end_period DESC, id ASC;
    `;
    const params = [user_pkid];
    const rows = await db.runSql(sql, params);
    return rows;
}

const getTodayTimetable = async (user_pkid, dayOfWeek) => {
    await ensureTimetableTable();
    const sql = `
        SELECT id, start_period, end_period, title, location, color
        FROM timetable_entries
        WHERE user_pkid = ? AND user_type = 'student' AND day = ?
        ORDER BY start_period ASC, end_period DESC, id ASC;
    `;
    const params = [user_pkid, dayOfWeek];
    const rows = await db.runSql(sql, params);
    return rows;
}

const getTodayPersonalEvents = async (user_pkid, user_type, date) => {
    await ensurePersonalEventsTable();
    const sql = `
        SELECT id, title, color, TIME_FORMAT(event_time, '%H:%i') AS time
        FROM personal_events
        WHERE user_pkid = ? AND user_type = ? AND event_date = ?
        ORDER BY event_time ASC, id ASC;
    `;
    const params = [user_pkid, user_type, date];
    const rows = await db.runSql(sql, params);
    return rows.map(r => ({ id: r.id, title: r.title, color: r.color, time: r.time }));
}

// 학생 사진 URL 업데이트
const updateStudentPhoto = async (user_pkid, photo_url) => {
    try {
        await ensureStudentPhotoColumn();
        const sql = "UPDATE student SET photo_url = ? WHERE pkid = ?;";
        const params = [photo_url, user_pkid];
        const result = await db.runSql(sql, params);
        return result.affectedRows;
    } catch (err) {
        throw err;
    }
}

// 관리자 사진 URL 업데이트
const updateAdminPhoto = async (user_pkid, photo_url) => {
    try {
        await ensureAdminColumns();
        const sql = "UPDATE administrator SET photo_url = ? WHERE pkid = ?;";
        const params = [photo_url, user_pkid];
        const result = await db.runSql(sql, params);
        return result.affectedRows;
    } catch (err) {
        throw err;
    }
}

// 학생 정보 조회 (사진 포함)
const getStudentInfo = async (user_pkid) => {
    try {
        const sql = "SELECT pkid, name, student_num, photo_url, is_fee_paid, major FROM student WHERE pkid = ?;";
        const params = [user_pkid];
        const result = await db.runSql(sql, params);
        return result[0];
    } catch (err) {
        throw err;
    }
}

// 특정 학생의 모든 학점 기록 조회
const getGradesByUser = async (student_pkid) => {
    try {
        // 년도와 학기 순으로 정렬하여 가져옵니다.
        const sql = `
            SELECT year, semester, course_name, credits, grade, is_major 
            FROM grades 
            WHERE student_pkid = ? 
            ORDER BY year, semester;
        `;
        const params = [student_pkid];
        const result = await db.runSql(sql, params);
        return result;
    } catch (err) {
        throw err;
    }
}

module.exports = {
    loginCheck,
    adminLoginCheck,
    checkPreRegisteredStudent,
    checkStudentAlreadyRegistered,
    checkUsernameExists,
    checkEmailExists,
    updateStudentRegistration,
    getAnnouncements,
    getRecentAnnouncements,
    getAnnouncementById,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    createPersonalEvent,
    getPersonalEventsByMonth,
    getPersonalEventById,
    deletePersonalEvent,
    updatePersonalEvent,
    createAcademicSchedule,
    getAcademicScheduleByMonth,
    getAcademicScheduleById,
    deleteAcademicSchedule,
    updateAcademicSchedule,
    getTodayPersonalEvents,
    getTodayTimetable,
    updateStudentPhoto,
    updateAdminPhoto,
    getStudentInfo,
    getGradesByUser,
    // timetable will be appended below
}

// ==== Timetable (classes) ====
const ensureTimetableTable = async () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS timetable_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_pkid INT NOT NULL,
            user_type ENUM('student', 'admin') NOT NULL DEFAULT 'student',
            day TINYINT NOT NULL, -- 1=Mon .. 5=Fri
            start_period TINYINT NOT NULL,
            end_period TINYINT NOT NULL,
            title VARCHAR(100) NOT NULL,
            location VARCHAR(100) NULL,
            color VARCHAR(32) NOT NULL DEFAULT 'bg-blue-100',
            memo TEXT NULL,
            professor VARCHAR(100) NULL,
            credits TINYINT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_day (user_pkid, user_type, day)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await db.runSql(sql);
    
    // memo 컬럼 추가 (기존 테이블에 없는 경우)
    try {
        await db.runSql('ALTER TABLE timetable_entries ADD COLUMN memo TEXT NULL;');
    } catch (err) {
        // 컬럼이 이미 존재하면 무시
    }
    
    // professor 컬럼 추가 (기존 테이블에 없는 경우)
    try {
        await db.runSql('ALTER TABLE timetable_entries ADD COLUMN professor VARCHAR(100) NULL;');
    } catch (err) {
        // 컬럼이 이미 존재하면 무시
    }
    
    // credits 컬럼 추가 (기존 테이블에 없는 경우)
    try {
        await db.runSql('ALTER TABLE timetable_entries ADD COLUMN credits TINYINT NULL;');
    } catch (err) {
        // 컬럼이 이미 존재하면 무시
    }
}

const addTimetableEntry = async (user_pkid, day, start_period, end_period, title, location, color, memo = null, professor = null, credits = null) => {
    await ensureTimetableTable();
    const sql = `
        INSERT INTO timetable_entries (user_pkid, user_type, day, start_period, end_period, title, location, color, memo, professor, credits)
        VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [user_pkid, day, start_period, end_period, title, location, color, memo, professor, credits];
    const result = await db.runSql(sql, params);
    return result.insertId;
}

const getTimetableByUser = async (user_pkid) => {
    await ensureTimetableTable();
    const sql = `
        SELECT id, day, start_period, end_period, title, location, color
        FROM timetable_entries
        WHERE user_pkid = ? AND user_type = 'student'
        ORDER BY day ASC, start_period ASC, end_period DESC, id ASC;
    `;
    const rows = await db.runSql(sql, [user_pkid]);
    return rows;
}

const getTimetableById = async (id, user_pkid) => {
    await ensureTimetableTable();
    const sql = `
        SELECT id, day, start_period, end_period, title, location, color, memo, professor, credits
        FROM timetable_entries
        WHERE id = ? AND user_pkid = ? AND user_type = 'student';
    `;
    const result = await db.runSql(sql, [id, user_pkid]);
    return result[0];
}

// 같은 과목명의 모든 시간표 항목 가져오기
const getTimetablesByTitle = async (title, user_pkid) => {
    await ensureTimetableTable();
    const sql = `
        SELECT id, day, start_period, end_period, title, location, color, memo, professor, credits
        FROM timetable_entries
        WHERE title = ? AND user_pkid = ? AND user_type = 'student'
        ORDER BY day ASC, start_period ASC;
    `;
    const result = await db.runSql(sql, [title, user_pkid]);
    return result;
}

const updateTimetableEntry = async (id, user_pkid, day, start_period, end_period, title, location, color) => {
    await ensureTimetableTable();
    const sql = `
        UPDATE timetable_entries
        SET day = ?, start_period = ?, end_period = ?, title = ?, location = ?, color = ?
        WHERE id = ? AND user_pkid = ? AND user_type = 'student';
    `;
    const params = [day, start_period, end_period, title, location, color, id, user_pkid];
    const result = await db.runSql(sql, params);
    return result.affectedRows;
}

const deleteTimetableEntry = async (id, user_pkid) => {
    await ensureTimetableTable();
    const sql = "DELETE FROM timetable_entries WHERE id = ? AND user_pkid = ? AND user_type = 'student';";
    const result = await db.runSql(sql, [id, user_pkid]);
    return result.affectedRows;
}

module.exports.ensureTimetableTable = ensureTimetableTable;
module.exports.addTimetableEntry = addTimetableEntry;
module.exports.getTimetableByUser = getTimetableByUser;
module.exports.getTimetableById = getTimetableById;
module.exports.getTimetablesByTitle = getTimetablesByTitle;
module.exports.updateTimetableEntry = updateTimetableEntry;
module.exports.deleteTimetableEntry = deleteTimetableEntry;