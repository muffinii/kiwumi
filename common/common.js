const xss = require('xss');
const path = require('path');
const fs = require('fs');

const dateFormat = (date, pattern = 'yyyy-mm-dd hh:ii:ss') => {
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();

    month = month >= 10 ? month : '0' + month;
    day = day >= 10 ? day : '0' + day;
    hour = hour >= 10 ? hour : '0' + hour;
    minute = minute >= 10 ? minute : '0' + minute;
    second = second >= 10 ? second : '0' + second;

    pattern = pattern.replace(/yyyy/g, date.getFullYear());
    pattern = pattern.replace(/mm/g, month);
    pattern = pattern.replace(/dd/g, day);
    pattern = pattern.replace(/hh/g, hour);
    pattern = pattern.replace(/ii/g, minute);
    pattern = pattern.replace(/ss/g, second);

    return pattern;
}

const checkLogin = (req, res, isMust = true) => {
    let loginUserInfo = req.session.user;

    if (loginUserInfo == null) {
        if (isMust) {
            alertAndGo(res, "로그이 필요합니다.", "/member/login");
        }
        return null;
    }

    return loginUserInfo;
};

const alertAndGo = (res, msg, url) => {
    res.render('common/alert', { msg, url });
}

const isNumber = (n) => {
    return /^-?[\d.]+(?:e-?\d+)?$/.test(n);
};

const reqeustFilter = (data, type, isHtml, defaultvalue = null) => {
    switch (type) {
        case 0:
            if (data != undefined) {
                let checkVal = data.replaceAll(',', '');
                if (!isNumber(checkVal)) {
                    throw "parameter is not number Error";
                }
            }
            break;
        case -1:
            if (!isHtml) {
                data = xss(data);
            }
            break;
        default:
            if (type < data.length) {
                throw "input length is too long";
            }

            if (!isHtml) {
                data = xss(data);
            }
            break;
    }

    if (data == null || data == '') {
        if (defaultvalue != null) {
            data = defaultvalue;
        } else {
            throw "input parameter not allow null";
        }
    }

    return data;
}

const pageNavigation = (printSize, page, pageSize, totalcount, url, params) => {
    let html = '';

    let totalPage = parseInt(totalcount / pageSize);
    if (totalcount % pageSize != 0) {
        totalPage++;
    }

    if (totalPage > 0 && page <= totalPage) {
        start = parseInt((page - 1) / printSize) * printSize + 1;
        end = start + (printSize - 1);

        if (end > totalPage) end = totalPage;

        html += '<nav aria-label="Page navigation ">';
        html += '   <ul class="pagination justify-content-center">';

        if (start > printSize) {
            let prevPage = start - 1;

            html += '       <li class="page-item">';
            html += '           <a class="page-link" href="' + url + '?page=' + prevPage + params + '" aria-label="Previous">';
            html += '               <span aria-hidden="true">&laquo;</span>';
            html += '           </a>';
            html += '       </li>';
        } else {
            html += '       <li class="page-item">';
            html += '           <a class="page-link disabled" href="' + url + '?page=1' + params + '" aria-label="Previous">';
            html += '               <span aria-hidden="true">&laquo;</span>';
            html += '           </a>';
            html += '       </li>';
        }

        let cnt = 1;
        for (let i = start; i <= end; i++) {
            if (page == i)
                html += '<li class="page-item active"><a class="page-link disabled" href="' + url + '?page=' + i + params + '">' + i + '</a></li>';
            else
                html += '<li class="page-item"><a class="page-link" href="' + url + '?page=' + i + params + '">' + i + '</a></li>';
            if (++cnt > printSize) break;
        }

        if (totalPage - start >= printSize) {
            let nextPage = start + printSize;
            html += '<li class="page-item">';
            html += '   <a class="page-link" href="' + url + '?page=' + nextPage + params + '" aria-label="Next">';
            html += '       <span aria-hidden="true">&raquo;</span>';
            html += '   </a>';
            html += '</li>';
        } else {
            html += '<li class="page-item">';
            html += '   <a class="page-link disabled" href="#" aria-label="Next">';
            html += '       <span aria-hidden="true">&raquo;</span>';
            html += '   </a>';
            html += '</li>';
        }

        html += '   </ul>';
        html += '</nav>';
    }

    return html;
}

const fileFilter = (req, file, callbackfunciton) => {
    const filetypes = /.jpg|.png|.gif/
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase())

    if (extname) {
        return callbackfunciton(null, true);
    } else {
        callbackfunciton('Error: Image Only!');
    }
}

const fileDelete = (file) => {
    try {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file)
        }
    } catch (error) {
        throw "fileDelete Error";
    }
}

const getFileEXtension = (filename) => {
    return '.' + filename.split('.').pop();
}

const fileMove = (oldFilePath, newFilePath) => {
    try {
        if (fs.existsSync(oldFilePath)) {
            fs.renameSync(oldFilePath, newFilePath);
        }
    } catch (error) {
        throw "fileMove Error";
    }
}

module.exports = {
    checkLogin,
    alertAndGo,
    reqeustFilter,
    dateFormat,
    pageNavigation,
    fileFilter,
    fileDelete,
    getFileEXtension,
    fileMove
}