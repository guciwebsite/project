var mysql = require('mysql');

// var db = mysql.createConnection({
//     host: "localhost",
//     user: "root",
//     password: "",
//     database: 'whatsapp'
// });

// db.connect(function(err) {
//     if (err) throw err;
//     console.log("Connected!");
// });
const createConnection = async() => {
	return await mysql.createConnection({
		host: "localhost",
	    user: "root",
	    password: "",
	    database: 'whatsapp'
	})
}

// const getReplay = async(keyword) => {
// 	const connect = await createConnection();
// 	const [row] = await connect.execute("select * from otp where keyword = 'otp'");
// 	if
// }