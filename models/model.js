const db = require('../common/db');

// 로그인
const loginCheck = async (identifier, student_pw) => {
    try {
        const sql = `
            SELECT pkid, name, student_num, photo_url, is_fee_paid, major
            FROM student
            WHERE (student_num = ? OR student_id = ?) AND student_pw = ?;
        `;
        const params = [identifier, identifier, student_pw];
        const result = await db.runSql(sql, params);
        return result[0];
    } catch (err) {
        // student_id 컬럼이 없는 경우면 학번만으로 재시도
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

// 회원가입: 이름과 사번으로 사전 등록된 관리자(직원) 확인
const checkPreRegisteredAdmin = async (name, employee_num) => {
    try {
        const sql = `
            SELECT pkid, name, employee_num, admin_id, email
            FROM administrator
            WHERE name = ? AND employee_num = ?;
        `;
        const params = [name, employee_num];
        const result = await db.runSql(sql, params);
        return result[0];
    } catch (err) {
        console.error('관리자 사전 등록 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 이미 가입된 계정인지 확인
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

// 회원가입: 이미 가입된 관리자 계정인지 확인
const checkAdminAlreadyRegistered = async (admin_pkid) => {
    try {
        const sql = `
            SELECT admin_id, email
            FROM administrator
            WHERE pkid = ? 
              AND (admin_id NOT LIKE 'temp_%') 
              AND (email IS NOT NULL AND email NOT LIKE '%@temp.placeholder');
        `;
        const result = await db.runSql(sql, [admin_pkid]);
        return result.length > 0;
    } catch (err) {
        console.error('관리자 가입 여부 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 아이디 중복 체크
const checkUsernameExists = async (username) => {
    try {
        // 학생 테이블에서 확인
        const studentSql = `
            SELECT pkid
            FROM student
            WHERE student_id = ? AND student_id != 'temp_id';
        `;
        const studentResult = await db.runSql(studentSql, [username]);
        if (studentResult.length > 0) return true;

        // 관리자 테이블에서 확인
        const adminSql = `
            SELECT pkid
            FROM administrator
            WHERE admin_id = ? AND admin_id NOT LIKE 'temp_%';
        `;
        const adminResult = await db.runSql(adminSql, [username]);
        return adminResult.length > 0;
    } catch (err) {
        console.error('아이디 중복 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 관리자 아이디 중복 체크
const checkAdminUsernameExists = async (admin_id) => {
    try {
        // 관리자 테이블에서 확인
        const adminSql = `
            SELECT pkid FROM administrator
            WHERE admin_id = ? AND admin_id NOT LIKE 'temp_%';
        `;
        const adminResult = await db.runSql(adminSql, [admin_id]);
        if (adminResult.length > 0) return true;

        // 학생 테이블에서 확인
        const studentSql = `
            SELECT pkid FROM student
            WHERE student_id = ? AND student_id != 'temp_id';
        `;
        const studentResult = await db.runSql(studentSql, [admin_id]);
        return studentResult.length > 0;
    } catch (err) {
        console.error('관리자 아이디 중복 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 이메일 중복 체크
const checkEmailExists = async (email) => {
    try {
        // 학생 테이블에서 확인
        const studentSql = `
            SELECT pkid
            FROM student
            WHERE email = ? AND email NOT LIKE '%@temp.placeholder';
        `;
        const studentResult = await db.runSql(studentSql, [email]);
        if (studentResult.length > 0) return true;

        // 관리자 테이블에서 확인
        const adminSql = `
            SELECT pkid
            FROM administrator
            WHERE email = ? AND email NOT LIKE '%@temp.placeholder';
        `;
        const adminResult = await db.runSql(adminSql, [email]);
        return adminResult.length > 0; // 이미 있으면 true
    } catch (err) {
        console.error('이메일 중복 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 관리자 이메일 중복 체크
const checkAdminEmailExists = async (email) => {
    try {
        // 관리자 테이블에서 확인
        const adminSql = `
            SELECT pkid FROM administrator
            WHERE email = ? AND email NOT LIKE '%@temp.placeholder';
        `;
        const adminResult = await db.runSql(adminSql, [email]);
        if (adminResult.length > 0) return true;

        // 학생 테이블에서 확인
        const studentSql = `
            SELECT pkid FROM student
            WHERE email = ? AND email NOT LIKE '%@temp.placeholder';
        `;
        const studentResult = await db.runSql(studentSql, [email]);
        return studentResult.length > 0;
    } catch (err) {
        console.error('관리자 이메일 중복 확인 오류:', err);
        throw err;
    }
}

// 회원가입: 학생 정보 업데이트
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

// 회원가입: 관리자 정보 업데이트
const updateAdminRegistration = async (admin_pkid, admin_id, admin_pw, email) => {
    try {
        const sql = `
            UPDATE administrator
            SET admin_id = ?, admin_pw = ?, email = ?
            WHERE pkid = ?;
        `;
        const params = [admin_id, admin_pw, email, admin_pkid];
        await db.runSql(sql, params);
    } catch (err) {
        console.error('관리자 정보 업데이트 오류:', err);
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
        const sql = "INSERT INTO announcements (title, content, author_pkid, category, attachments, created_at) VALUES (?, ?, ?, ?, ?, NOW());";
        const params = [title, content, author_pkid, category, attachments];
        const result = await db.runSql(sql, params);
        return result.insertId;
    } catch (err) {
        throw err;
    }
}
// 최근 공지 5개 조회
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
            SELECT a.pkid, a.title, a.content, a.category, a.author_pkid, a.created_at, a.attachments, admin.name as author_name
            FROM announcements a
            LEFT JOIN administrator admin ON a.author_pkid = admin.pkid
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

const createPersonalEvent = async (user_pkid, user_type, title, event_date, event_time, color, memo = null, alarms = null) => {
    const alarmsJson = alarms ? JSON.stringify(alarms) : null;
    const sql = `
        INSERT INTO personal_events (user_pkid, user_type, title, event_date, event_time, color, memo, alarms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [user_pkid, user_type, title, event_date, event_time, color, memo, alarmsJson];
    const result = await db.runSql(sql, params);
    return result.insertId;
}

const getPersonalEventsByMonth = async (user_pkid, user_type, year, month1to12) => {
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
    const sql = `
     SELECT id, title, DATE_FORMAT(event_date, '%Y-%m-%d') as event_date, 
         TIME_FORMAT(event_time, '%H:%i') as event_time, color, memo, alarms
        FROM personal_events
        WHERE id = ? AND user_pkid = ? AND user_type = ?;
    `;
    const params = [event_id, user_pkid, user_type];
    const result = await db.runSql(sql, params);
    const event = result[0];
    
    if (!event) {
        return null;
    }
    
    if (event.alarms) {
        try {
            if (typeof event.alarms === 'string') {
                event.alarms = JSON.parse(event.alarms);
            }
        } catch (e) {
            event.alarms = [];
        }
    } else {
        event.alarms = [];
    }
    return event;
}

// 개인 일정 삭제
const deletePersonalEvent = async (event_id, user_pkid, user_type) => {
    const sql = `
        DELETE FROM personal_events
        WHERE id = ? AND user_pkid = ? AND user_type = ?;
    `;
    const params = [event_id, user_pkid, user_type];
    await db.runSql(sql, params);
}

// 개인 일정 수정
const updatePersonalEvent = async (event_id, user_pkid, user_type, title, event_date, event_time, color, memo = null, alarms = null) => {
    const alarmsJson = alarms ? JSON.stringify(alarms) : null;
    const sql = `
        UPDATE personal_events
        SET title = ?, event_date = ?, event_time = ?, color = ?, memo = ?, alarms = ?
        WHERE id = ? AND user_pkid = ? AND user_type = ?;
    `;
    const params = [title, event_date, event_time, color, memo, alarmsJson, event_id, user_pkid, user_type];
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
        const sql = "UPDATE administrator SET photo_url = ? WHERE pkid = ?;";
        const params = [photo_url, user_pkid];
        const result = await db.runSql(sql, params);
        return result.affectedRows;
    } catch (err) {
        throw err;
    }
}

// 학생 정보 조회
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
        const sql = `
            SELECT id as pkid, year, semester, course_name, credits, grade, is_major 
            FROM grades 
            WHERE student_pkid = ? 
            ORDER BY year DESC, semester DESC;
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
    checkPreRegisteredAdmin,
    checkStudentAlreadyRegistered,
    checkAdminAlreadyRegistered,
    checkUsernameExists,
    checkAdminUsernameExists,
    checkEmailExists,
    checkAdminEmailExists,
    updateStudentRegistration,
    updateAdminRegistration,
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
    getGradesByUser
}

const addOrUpdateGrade = async (student_pkid, year, semester, course_name, credits, grade, is_major = 0) => {
    const sql = `
        INSERT INTO grades (student_pkid, year, semester, course_name, credits, grade, is_major)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE credits = VALUES(credits), grade = VALUES(grade), is_major = VALUES(is_major);
    `;
    const params = [student_pkid, year, semester, course_name, credits || 0, grade, is_major ? 1 : 0];
    const result = await db.runSql(sql, params);
    return result.insertId || true;
};

// 성적 ID로 단일 조회
const getGradeById = async (gradeId, student_pkid) => {
    try {
        const sql = `
            SELECT id as pkid, year, semester, course_name, credits, grade, is_major
            FROM grades
            WHERE id = ? AND student_pkid = ?;
        `;
        const result = await db.runSql(sql, [gradeId, student_pkid]);
        return result[0];
    } catch (err) {
        throw err;
    }
};

// 성적 수정
const updateGrade = async (gradeId, student_pkid, grade, is_major) => {
    try {
        const sql = `
            UPDATE grades
            SET grade = ?, is_major = ?
            WHERE id = ? AND student_pkid = ?;
        `;
        const params = [grade, is_major ? 1 : 0, gradeId, student_pkid];
        const result = await db.runSql(sql, params);
        return result.affectedRows;
    } catch (err) {
        throw err;
    }
};

// 성적 삭제
const deleteGrade = async (gradeId, student_pkid) => {
    try {
        const sql = `
            DELETE FROM grades
            WHERE id = ? AND student_pkid = ?;
        `;
        const result = await db.runSql(sql, [gradeId, student_pkid]);
        return result.affectedRows;
    } catch (err) {
        throw err;
    }
};

const getUserTimetableCourses = async (user_pkid) => {
    const sql = `
        SELECT title AS course_name, 
               COALESCE(MAX(credits), 0) AS credits
        FROM timetable_entries
        WHERE user_pkid = ? AND user_type = 'student'
        GROUP BY title
        ORDER BY title ASC;
    `;
    const rows = await db.runSql(sql, [user_pkid]);
    return rows.map(r => ({ id: r.course_name, title: r.course_name, credits: r.credits }));
};

const addTimetableEntry = async (user_pkid, day, start_period, end_period, title, location, color, memo = null, professor = null, credits = null) => {
    const sql = `
        INSERT INTO timetable_entries (user_pkid, user_type, day, start_period, end_period, title, location, color, memo, professor, credits)
        VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [user_pkid, day, start_period, end_period, title, location, color, memo, professor, credits];
    const result = await db.runSql(sql, params);
    return result.insertId;
}

const getTimetableByUser = async (user_pkid) => {
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
    const sql = "DELETE FROM timetable_entries WHERE id = ? AND user_pkid = ? AND user_type = 'student';";
    const result = await db.runSql(sql, [id, user_pkid]);
    return result.affectedRows;
}

const getAllAvailableCourses = async () => {
    const sql = `
        SELECT 
            c.id AS course_id,
            c.title,
            c.credits,
            c.department,
            cs.id AS section_id,
            cs.section_number,
            cs.professor,
            cs.classroom,
            css.day_of_week,
            css.start_period,
            css.end_period
        FROM courses c
        JOIN course_sections cs ON c.id = cs.course_id
        JOIN course_schedule css ON cs.id = css.section_id
        WHERE c.is_active = TRUE AND cs.is_available = TRUE
        ORDER BY c.id, cs.section_number, css.day_of_week, css.start_period;
    `;
    const result = await db.runSql(sql);
    return result;
}

// 특정 분반의 상세 정보 조회
const getSectionDetails = async (section_id) => {
    const sql = `
        SELECT 
            c.id AS course_id,
            c.title,
            c.credits,
            cs.id AS section_id,
            cs.section_number,
            cs.professor,
            cs.classroom,
            css.id AS schedule_id,
            css.day_of_week,
            css.start_period,
            css.end_period
        FROM courses c
        JOIN course_sections cs ON c.id = cs.course_id
        JOIN course_schedule css ON cs.id = css.section_id
        WHERE cs.id = ?
        ORDER BY css.day_of_week, css.start_period;
    `;
    const result = await db.runSql(sql, [section_id]);
    return result;
}

// 특정 과목의 모든 분반 조회
const getSectionsByCourseId = async (course_id) => {
    const sql = `
        SELECT 
            cs.id,
            cs.section_number,
            cs.professor,
            cs.classroom AS place,
            GROUP_CONCAT(
                CONCAT(
                    CASE css.day_of_week
                        WHEN 1 THEN '월'
                        WHEN 2 THEN '화'
                        WHEN 3 THEN '수'
                        WHEN 4 THEN '목'
                        WHEN 5 THEN '금'
                    END,
                    ' ',
                    LPAD(9 + (css.start_period - 1), 2, '0'), ':00-',
                    LPAD(9 + css.end_period, 2, '0'), ':00'
                )
                ORDER BY css.day_of_week, css.start_period
                SEPARATOR ', '
            ) AS time_string
        FROM course_sections cs
        LEFT JOIN course_schedule css ON cs.id = css.section_id
        WHERE cs.course_id = ? AND cs.is_available = TRUE
        GROUP BY cs.id, cs.section_number, cs.professor, cs.classroom
        ORDER BY cs.section_number;
    `;
    const result = await db.runSql(sql, [course_id]);
    return result;
}

// 과목 제목으로 모든 분반의 상세 일정 조회 (수정용)
const getSectionsByCourseTitleWithSchedules = async (courseTitle) => {
    const sql = `
        SELECT 
            cs.id AS section_id,
            c.title AS course_title,
            cs.section_number,
            cs.professor,
            cs.classroom,
            css.id AS schedule_id,
            css.day_of_week,
            css.start_period,
            css.end_period
        FROM courses c
        JOIN course_sections cs ON c.id = cs.course_id
        LEFT JOIN course_schedule css ON cs.id = css.section_id
        WHERE c.title = ? AND cs.is_available = TRUE
        ORDER BY cs.section_number, css.day_of_week, css.start_period;
    `;
    const result = await db.runSql(sql, [courseTitle]);
    return result;
}

// 시간표 시간 충돌 체크
const checkTimetableConflict = async (user_pkid, day_of_week, start_period, end_period) => {
    const sql = `
        SELECT id, title, day, start_period, end_period, location
        FROM timetable_entries
        WHERE user_pkid = ? 
          AND user_type = 'student'
          AND day = ?
          AND NOT (end_period < ? OR start_period > ?)
        LIMIT 1;
    `;
    const params = [user_pkid, day_of_week, start_period, end_period];
    const result = await db.runSql(sql, params);
    return result[0];
}

// 사용자가 이미 특정 과목을 시간표에 추가했는지 확인
const checkCourseAlreadyAdded = async (user_pkid, course_title) => {
    const sql = `
        SELECT id, title
        FROM timetable_entries
        WHERE user_pkid = ? AND user_type = 'student' AND title = ?
        LIMIT 1;
    `;
    const result = await db.runSql(sql, [user_pkid, course_title]);
    return result[0];
}

module.exports.addTimetableEntry = addTimetableEntry;
module.exports.getTimetableByUser = getTimetableByUser;
module.exports.getTimetableById = getTimetableById;
module.exports.getTimetablesByTitle = getTimetablesByTitle;
module.exports.updateTimetableEntry = updateTimetableEntry;
module.exports.deleteTimetableEntry = deleteTimetableEntry;
module.exports.addOrUpdateGrade = addOrUpdateGrade;
module.exports.getGradeById = getGradeById;
module.exports.updateGrade = updateGrade;
module.exports.deleteGrade = deleteGrade;
module.exports.getUserTimetableCourses = getUserTimetableCourses;

module.exports.getAllAvailableCourses = getAllAvailableCourses;
module.exports.getSectionDetails = getSectionDetails;
module.exports.getSectionsByCourseId = getSectionsByCourseId;
module.exports.getSectionsByCourseTitleWithSchedules = getSectionsByCourseTitleWithSchedules;
module.exports.checkTimetableConflict = checkTimetableConflict;
module.exports.checkCourseAlreadyAdded = checkCourseAlreadyAdded;

// 이메일로 사용자 찾기
const findUserByEmail = async (email) => {
    try {
        // 학생 테이블에서 검색
        let sql = 'SELECT pkid, name, email, "student" as user_type FROM student WHERE email = ?;';
        let result = await db.runSql(sql, [email]);
        if (result.length > 0) return result[0];

        // 관리자 테이블에서 검색
        sql = 'SELECT pkid, name, email, "admin" as user_type FROM administrator WHERE email = ?;';
        result = await db.runSql(sql, [email]);
        if (result.length > 0) return result[0];

        return null;
    } catch (err) {
        throw err;
    }
};

// 인증 코드 저장
const saveVerificationCode = async (email, code, expiresInMinutes = 10) => {
    try {
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
        const sql = `
            INSERT INTO verification_codes (email, code, expires_at)
            VALUES (?, ?, ?);
        `;
        const result = await db.runSql(sql, [email, code, expiresAt]);
        return result.insertId;
    } catch (err) {
        throw err;
    }
};

// 인증 코드 확인
const verifyCode = async (email, code) => {
    try {
        const sql = `
            SELECT id, email
            FROM verification_codes
            WHERE email = ? AND code = ? 
              AND expires_at > NOW() 
              AND is_used = 0
            ORDER BY created_at DESC
            LIMIT 1;
        `;
        const result = await db.runSql(sql, [email, code]);
        
        if (result.length > 0) {
            // 사용 처리
            const updateSql = 'UPDATE verification_codes SET is_used = 1 WHERE id = ?;';
            await db.runSql(updateSql, [result[0].id]);
            return true;
        }
        return false;
    } catch (err) {
        throw err;
    }
};

// 비밀번호 재설정 토큰 생성
const createPasswordResetToken = async (email) => {
    try {
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30분 유효

        const sql = `
            INSERT INTO password_reset_tokens (email, token, expires_at)
            VALUES (?, ?, ?);
        `;
        await db.runSql(sql, [email, token, expiresAt]);
        return token;
    } catch (err) {
        throw err;
    }
};

// 비밀번호 재설정 토큰 확인
const verifyPasswordResetToken = async (token) => {
    try {
        const sql = `
            SELECT id, email
            FROM password_reset_tokens
            WHERE token = ? 
              AND expires_at > NOW() 
              AND is_used = 0
            LIMIT 1;
        `;
        const result = await db.runSql(sql, [token]);
        
        if (result.length > 0) {
            return { valid: true, email: result[0].email, tokenId: result[0].id };
        }
        return { valid: false };
    } catch (err) {
        throw err;
    }
};

// 비밀번호 변경
const updatePassword = async (email, newPassword) => {
    try {
        // 학생인지 관리자인지 확인
        const user = await findUserByEmail(email);
        if (!user) return false;

        if (user.user_type === 'student') {
            const sql = 'UPDATE student SET student_pw = ? WHERE email = ?;';
            await db.runSql(sql, [newPassword, email]);
        } else {
            const sql = 'UPDATE administrator SET admin_pw = ? WHERE email = ?;';
            await db.runSql(sql, [newPassword, email]);
        }
        return true;
    } catch (err) {
        throw err;
    }
};

// 토큰 사용 처리
const markTokenAsUsed = async (tokenId) => {
    try {
        const sql = 'UPDATE password_reset_tokens SET is_used = 1 WHERE id = ?;';
        await db.runSql(sql, [tokenId]);
    } catch (err) {
        throw err;
    }
};

// 알림 생성
const createNotification = async (user_pkid, user_type, type, title, message, link_url = null) => {
    const sql = `
        INSERT INTO notifications (user_pkid, user_type, type, title, message, link_url)
        VALUES (?, ?, ?, ?, ?, ?);
    `;
    const result = await db.runSql(sql, [user_pkid, user_type, type, title, message, link_url]);
    return result.insertId;
};

// 모든 사용자에게 알림 생성 (공지사항용)
const createNotificationForAll = async (type, title, message, link_url = null) => {
    const students = await db.runSql('SELECT pkid FROM student');
    const admins = await db.runSql('SELECT pkid FROM administrator');
    
    const notifications = [];
    
    for (const student of students) {
        notifications.push([student.pkid, 'student', type, title, message, link_url]);
    }
    
    for (const admin of admins) {
        notifications.push([admin.pkid, 'admin', type, title, message, link_url]);
    }
    
    if (notifications.length > 0) {
        for (const notif of notifications) {
            const sql = `
                INSERT INTO notifications (user_pkid, user_type, type, title, message, link_url)
                VALUES (?, ?, ?, ?, ?, ?);
            `;
            await db.runSql(sql, notif);
        }
    }
};

// 사용자 알림 목록 조회
const getNotifications = async (user_pkid, user_type) => {
    const sql = `
        SELECT id, type, title, message, link_url, is_read, 
               DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
        FROM notifications
        WHERE user_pkid = ? AND user_type = ?
        ORDER BY is_read ASC, created_at DESC
        LIMIT 100;
    `;
    return await db.runSql(sql, [user_pkid, user_type]);
};

// 미확인 알림 개수
const getUnreadNotificationCount = async (user_pkid, user_type) => {
    const sql = `
        SELECT COUNT(*) as count
        FROM notifications
        WHERE user_pkid = ? AND user_type = ? AND is_read = FALSE;
    `;
    const result = await db.runSql(sql, [user_pkid, user_type]);
    return result[0].count;
};

// 알림 읽음 처리
const markNotificationAsRead = async (notification_id, user_pkid, user_type) => {
    const sql = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = ? AND user_pkid = ? AND user_type = ?;
    `;
    await db.runSql(sql, [notification_id, user_pkid, user_type]);
};

// 모든 알림 읽음 처리
const markAllNotificationsAsRead = async (user_pkid, user_type) => {
    const sql = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_pkid = ? AND user_type = ? AND is_read = FALSE;
    `;
    await db.runSql(sql, [user_pkid, user_type]);
};

// 특정 일정과 관련된 알림 삭제
const deleteNotificationsByEvent = async (event_id, user_pkid, user_type) => {
    const sql = `
        DELETE FROM notifications
        WHERE user_pkid = ? AND user_type = ? AND type = 'event' AND link_url LIKE ?;
    `;
    const linkPattern = `%eventId=${event_id}%`;
    await db.runSql(sql, [user_pkid, user_type, linkPattern]);
};

// 사용자의 모든 알림 삭제
const deleteAllNotifications = async (user_pkid, user_type) => {
    const sql = `
        DELETE FROM notifications
        WHERE user_pkid = ? AND user_type = ?;
    `;
    await db.runSql(sql, [user_pkid, user_type]);
};

module.exports.findUserByEmail = findUserByEmail;
module.exports.saveVerificationCode = saveVerificationCode;
module.exports.verifyCode = verifyCode;
module.exports.createPasswordResetToken = createPasswordResetToken;
module.exports.verifyPasswordResetToken = verifyPasswordResetToken;
module.exports.updatePassword = updatePassword;
module.exports.markTokenAsUsed = markTokenAsUsed;
module.exports.createNotification = createNotification;
module.exports.createNotificationForAll = createNotificationForAll;
module.exports.getNotifications = getNotifications;
module.exports.getUnreadNotificationCount = getUnreadNotificationCount;
module.exports.markNotificationAsRead = markNotificationAsRead;
module.exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
module.exports.deleteNotificationsByEvent = deleteNotificationsByEvent;
module.exports.deleteAllNotifications = deleteAllNotifications;