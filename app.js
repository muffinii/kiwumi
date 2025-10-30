const express = require("express");
const nunjucks = require("nunjucks");

const app = express();
app.set('view engine', 'html');

// View Engine 설정
nunjucks.configure('views', {
    express: app,
    watch: true
})

// post 데이터 받기
app.use(express.urlencoded({
    extended : true
}));

app.use("/assets", express.static(__dirname + "/views/assets"));

// Session 사용 설정
const session = require('express-session');
const sessionDB = require('express-mysql-session')(session);
const db = require('./common/db');

// 실제 session 적용
app.use(
    session({
        secret: "kiwu",
        resave: true,
        saveUninitialized : false, // 아무 정보 없는 세션 저장 금지

        // DB에 저장
        store: new sessionDB(db.db) 
    })
)

//Routing 방법
const indexRouter = require('./routers/home');

app.use('/', indexRouter.router);

app.use((req, res) => {
    res.status(404).send("404 오류 발생");
});

app.listen( // 80 : 포트
    80, () => {
        console.log(80, '번에서 express 동작 중...');
    }
);