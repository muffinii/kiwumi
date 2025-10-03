const express = require("express");
const nunjucks = require("nunjucks");

const app = express();
app.set('view engine', 'html');

// View Engine 설정
nunjucks.configure('views', {
    express: app,
    watch: true
})

// 정적파일 설정
app.use("/assets", express.static(__dirname + "/views/assets"));

//Routing 방법
const indexRouter = require('./routers/home');

app.use('/', indexRouter.router);

// 404 Not found
app.use((req, res) => {
    res.status(404).send("404 오류 발생");
});

app.listen( // 80 : 포트
    80, () => {
        console.log(80, '번에서 express 동작 중...');
    }
);