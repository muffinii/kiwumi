const model = require('../models/model');
const common = require('../common/common');

const main = (req, res) => {
    try {
        res.render('Main');
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

        console.log(student_num, student_pw);
        const result = await model.loginCheck(student_num, student_pw);

        if(result != null) {
            // 로그인처리 ==> 세션 저장

        } else {
            // 아이디 또는 비번이 틀린 경우
            res.send('<script>alert("학번 또는 비밀번호가 잘못되었습니다."); location.href="login";</script>');
        }
    } catch {
        res.status(500).send("500 Error");
    }
}

module.exports = {
    main,
    login,
    loginProc
}