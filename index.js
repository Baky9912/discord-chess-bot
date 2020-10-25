const config = require('./config.json');
const mysql = require('mysql');
const Discord = require('discord.js');
const client = new Discord.Client();

const debug = false;

var con = mysql.createConnection({
    host: config.db_host,
    user: config.db_user,
    password: config.db_password,
    database: config.db_database
});

con.connect(function(err) {
    if (err) throw err;
});
connection.end(function(err) {
    if (err) throw err;
});
con.on('error', function(err) {
    console.error(err);
});

function checkAndCreateUser(userID, username) {
    con.connect(function(err) {
        if (err) throw err;
    });
    var sql = `select count(userid) from users where userid=${mysql.escape(userID)}`;
    con.query(sql, function(err, result) {
        if (err) { console.error(err); return; }
        if (result == null || result.length == 0) { console.error('Result size is 0'); return; }
        var res = JSON.parse(JSON.stringify(result))[0];
        if (res['count(userid)'] == 0) {
            var sql = String.raw `insert into users (userid, username, points, attempts) 
            values (${mysql.escape(userID)}, ${mysql.escape(username)}, 0, 0);`;
            con.query(sql, function(err, result) {
                if (result.length == 0) { console.error('Result size is 0'); return; }
                if (err) { console.error(err); return; }
            });
        }
        var sql = `update users set username=${mysql.escape(username)} where userid=${mysql.escape(userID)}`;
        con.query(sql, function(err, result) {
            if (err) { console.error(err); return; }
            if (result == null || result.length == 0) { console.error('Result size is 0'); return; }
        });
    });
    connection.end(function(err) {
        if (err) throw err;
    });
}


function addAttempt_orig(userID) {
    con.connect(function(err) {
        if (err) throw err;
    });
    var sql = `select attempts from users where userid=${mysql.escape(userID)}`;
    con.query(sql, function(err, result) {
        if (err) { console.error(err); return; }
        if (result == null || result.length == 0) { console.error('Result size is 0'); return; }
        var res = JSON.parse(JSON.stringify(result))[0];
        var sql = `update users set attempts=${res.attempts+1} where userid=${mysql.escape(userID)}`;
        con.query(sql, function(err, result) {
            if (err) { console.error(err); return; }
            if (result == null || result.length == 0) { console.error('Result size is 0'); return; }
        });
    });
    connection.end(function(err) {
        if (err) throw err;
    });
}

function addAttempt(userID) {
    setTimeout(function() { addAttempt_orig(userID); }, 3000);
}

function addPoints_orig(userID, p) {
    con.connect(function(err) {
        if (err) throw err;
    });
    var sql = `select points from users where userid=${mysql.escape(userID)}`;
    con.query(sql, function(err, result) {
        if (err) { console.error(err); return; }
        if (result == null || result.length == 0) { console.error('Result size is 0'); return; }
        var res = JSON.parse(JSON.stringify(result))[0];
        var sql = `update users set points=${res.points+p} where userid=${mysql.escape(userID)}`;
        con.query(sql, function(err, result) {
            if (err) { console.error(err); return; }
            if (result == null || result.length == 0) { console.error('Result size is 0'); return; }
        });
    });
    connection.end(function(err) {
        if (err) throw err;
    });
}

function addPoints(userID, p) {
    setTimeout(function() { addPoints_orig(userID, p); }, 3000);
}


var puzzle_count = 0;
var puzzle_active = false;
var puzzle_progress;
var answers, real_answers, responses, real_responses, ignore_list = {};
var last_move = new Date();
var last_answ_id = null;
var piece_to_m;
var moves, real_moves;
var variation;
var last_url = '';
var embed;
var message_count = 0;
let move_re = /[kqrnba-h][a-h]?[1-8]?x?[a-h]?[1-8]=?[qrnb]?|O-O(-O)?/gmi;
let real_move_re = /\.{0,2}[kqrnba-h][a-h]?[1-8]?x?[a-h]?[1-8]=?[qrnb]?\+?#?|O-O(-O)?/gmi;

function terminate_puzzle(puzzle_number, message) {
    if (puzzle_number == puzzle_count) {
        puzzle_active = false;
        puzzle_count++;
        ignore_list = {};
        message_count = 0;
        message.channel.send('None solved it, solution: **' + variation + '**');
    }
}

function simplify_move(item) {
    return item.replace('x', '').replace('=', '').replace('#', '').replace('+', '').toLowerCase();
}

function seconds_forward(time) {
    var d = new Date();
    d.setSeconds(d.getSeconds() + time)
    return d;
}

function prev_moves(progress) {
    var ret = '';
    if (piece_to_m == 'White') {
        for (let i = 0; i < progress; ++i) {
            ret += (i + 1).toString() + '. ' + real_answers[i] + ' ' + real_responses[i] + ' ';
        }
    } else {
        if (progress > 0) ret = '1. ' + real_answers[0] + ' ';
        for (let i = 1; i < progress; ++i) {
            ret += (i + 1).toString() + '. ' + real_responses[i - 1] + ' ' + real_answers[i] + ' ';
        }
    }
    ret.replace('undefined', '');
    return ret;
}

function s_or_no(x) {
    if (x > 1) return 's';
    return '';
}

function getUserFromMention(mention) {
    if (!mention) return;

    if (mention.startsWith('<@') && mention.endsWith('>')) {
        mention = mention.slice(2, -1);

        if (mention.startsWith('!')) {
            mention = mention.slice(1);
        }

        return client.users.cache.get(mention);
    }
}

function ignore(id, time) {
    ignore_list[id] = true;
    setTimeout(function() { ignore_list[id] = false; }, time * 1000);
}

client.on('message', message => {
    if (message.author.bot) return;

    if (message.channel.name == config.channel) {
        message_count++;
        if (message_count == 10 && puzzle_active) setTimeout(function() {
            message_count = 0;
            message.channel.send(embed);
            message.channel.send('Previous moves: **' + prev_moves(puzzle_progress) + '**');
        }, 500);
    }

    const args = message.content.slice(config.prefix.length).split(/,| /);
    const command = args.shift().toLowerCase();

    if (command == "ignore") return;
    if (message.content.startsWith(config.prefix) && command == config.command && message.channel.name != config.channel) {
        message.channel.send(`You can only ask for puzzle ratings in this channel, go to #${config.channel} to do puzzles`);
    } else if (message.content.startsWith(config.prefix) && command == config.command && message.channel.name == config.channel && puzzle_active) {
        message.channel.send('There is already a puzzle active');
    } else if (message.content.startsWith(config.prefix) && command == config.command && message.channel.name == config.channel && args.length == 0) {
        const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
        yourUrl = "https://api.chess.com/pub/puzzle/random";

        function Get(yourUrl) {
            var Httpreq = new XMLHttpRequest(); // a new request
            Httpreq.open("GET", yourUrl, false);
            Httpreq.send(null);
            return Httpreq.responseText;
        }

        let json_obj = JSON.parse(Get(yourUrl));
        let _urlD = json_obj.url;
        let url = encodeURI(_urlD);
        if (url == last_url) {
            message.channel.send("Waiting on a new puzzle, try again in few seconds");
            return;
        }
        last_url = url;

        _sLinkD = json_obj.fen;
        _sLink = encodeURI(_sLinkD.trim());

        try {
            variation = JSON.parse(Get(yourUrl))
                .pgn
                .match(/\r\n\r\n(?<moves>.*)/m)
                .groups
                .moves;
            variation = variation.replace(/[({][^)]*[})]/gm, "");
        } catch {
            message.channel.send("Waiting on a new puzzle, try again in few seconds");
            return;
        }

        moves = variation.match(move_re);
        for (let i = 0; i < moves.length; ++i) {
            moves[i] = simplify_move(moves[i]);
        }

        real_moves = variation.match(real_move_re);

        answers = [];
        responses = [];
        real_answers = [];
        real_responses = [];

        for (let i = 0; i < moves.length; ++i) {
            if (i % 2 == 0) {
                answers.push(moves[i]);
                real_answers.push(real_moves[i]);
            } else {
                responses.push(moves[i]);
                real_responses.push(real_moves[i]);
            }
        }

        const regex = /^\s*([rnbqkpRNBQKP1-8]+\/){7}([rnbqkpRNBQKP1-8]+)\s[w-]\s(([a-hkqA-HKQ]{1,4})|(-))\s(([a-h][36])|(-))\s\d+\s\d+\s*/;
        if ((m = regex.exec(json_obj.fen)) !== null) {
            piece_to_m = "White";
        } else {
            piece_to_m = "Black";
        }

        _sParameter = json_obj.fen;
        _sParameter = encodeURIComponent(_sParameter.trim());
        _sParameter = `http://www.jinchess.com/chessboard/?p=${_sParameter}&ps=merida-flat&cm=o&gs`;
        //_sParameter = `http://www.jinchess.com/chessboard/?p=${_sParameter}&bp=slate&ps=merida&cm=o`;

        if (debug) {
            embed = new Discord.MessageEmbed()
                .setAuthor(`Chess.com random Puzzle`, `https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/SuperMember/phpLDm0ec.png`)
                .setThumbnail(`https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/SuperMember/phpLDm0ec.png`)
                .setTitle(`**Title: **${json_obj.title}`)
                .addField(`**Piece to move: ** `, `${piece_to_m}`)
                .addField(`**Length: **`, `${answers.length}`)
                .setColor(0x00AE86)
                .setImage(`${_sParameter}`)
                .addField(`Answer hidden below : `, `||**${variation}**||`)
                .setFooter("Notes: Send 1 or more moves. You get points only for the winning side");
        } else {
            embed = new Discord.MessageEmbed()
                .setTitle(`**Title: **${json_obj.title}`)
                .addField(`**Piece to move: ** `, `${piece_to_m}`)
                .addField(`**Length: **`, `${answers.length}`)
                .setColor(0xb5b5b5)
                .setImage(`${_sParameter}`);
        }
        message.channel.send(embed);

        puzzle_active = true;
        puzzle_progress = 0;
        message_count = 0;
        let x = puzzle_count;
        setTimeout(function() { terminate_puzzle(x, message); }, Math.min(answers.length, config.max_time_per_puzzle) * config.time_per_move * 1000);

    } else if (message.content.startsWith(config.prefix) && command == config.command && args.length == 1 && args[0] == 'help') {
        message.channel.send(`${config.prefix}puzzle ratings, ${config.prefix}puzzle ratings @player for ratings\nIn the #${config.channel} channel you can do ${config.prefix}puzzle to request a puzzle and answer it with abbreviated algebraic chess notation, one or more moves at a time (http://www.chesscorner.com/tutorial/basic/notation/notate.htm ), you only need to specify the piece and the square`); // HELP COMMAND
    } else if (message.content.startsWith(config.prefix) && command == config.command && args.length == 1 && args[0] == 'ratings') { //#puzzle ratings
        function multiply(char, num) {
            var ret = [];
            for (var i = 0; i < num; ++i) {
                ret.push(char);
            }
            return ret.join('');
        }
        con.connect(function(err) {
            if (err) throw err;
        });
        var sql = `select username, points, attempts
        from users
        order by points desc, attempts asc
        limit 10`;
        con.query(sql, function(err, result) {
            if (err) { console.error(err); return; }
            if (result == null || result.length == 0) { console.error('Result size is 0'); return; }
            //console.log(result);
            var msg = '```\n| rank |     username     |   points   |  attempts  |\n-----------------------------------------------------\n'
            for (var i = 0; i < result.length; ++i) {
                var res = JSON.parse(JSON.stringify(result[i]));
                var username = res['username'];
                if (username.length > 14) username = username.substring(0, 14);
                username = multiply(' ', Math.floor((14 - username.length) / 2)) + username + multiply(' ', Math.floor((14 - username.length + 1) / 2));
                var points = res['points'].toString();
                points = multiply(' ', Math.floor((8 - points.length) / 2)) + points + multiply(' ', Math.floor((8 - points.length + 1) / 2));
                var attempts = res['attempts'].toString();
                attempts = multiply(' ', Math.floor((8 - attempts.length) / 2)) + attempts + multiply(' ', Math.floor((8 - attempts.length + 1) / 2));
                var pos = (i + 1).toString();
                pos = multiply(' ', Math.floor((2 - pos.length) / 2)) + pos + multiply(' ', Math.floor((2 - pos.length + 1) / 2));
                msg += `|  ${pos}  |  ${username}  |  ${points}  |  ${attempts}  |\n`;
                msg += '-----------------------------------------------------\n';
            }
            msg += '```';
            message.channel.send(msg);
        });
        connection.end(function(err) {
            if (err) throw err;
        });
    } else if (message.content.startsWith(config.prefix) && command == config.command && args.length == 2 && args[0] == 'ratings' && getUserFromMention(args[1])) {
        var mention = getUserFromMention(args[1]);
        con.connect(function(err) {
            if (err) throw err;
        });
        var sql = `select points,attempts
            from users
            where userid=${mysql.escape(mention.id)}`

        con.query(sql, function(err, result) {
            if (err) { console.error(err); return; }

            if (result.length == 0) {
                message.channel.send(`User isn\'t registered in the database`);
                return;
            }
            var res = JSON.parse(JSON.stringify(result))[0];
            var points = res['points'];
            var attempts = res['attempts'];

            sql = `select count(userid)
            from users
            where points > ${points} or (points=${points} and attempts<${attempts})`;

            con.query(sql, function(err, result) {
                if (result.length == 0) { console.error('Result size is 0'); return; }
                if (err) { console.error(err); return; }
                var pos = JSON.parse(JSON.stringify(result))[0]['count(userid)'] + 1;
                message.channel.send(`${mention} is #${pos} with ${points} points from ${attempts} attempts`);
            });
        });
        connection.end(function(err) {
            if (err) throw err;
        });
    } else if (message.content.startsWith(config.prefix) && command == config.command && message.channel.name == config.channel && args.length > 0) {
        message.channel.send('You can check #puzzle help for more');
    } else if (puzzle_active && message.channel.name == config.channel && message.content.match(move_re) && (message.content.match(move_re).length > 1 || moves.length == 1) && !ignore_list[message.author.id]) {
        let user_moves = message.content.match(move_re);
        if (user_moves.length > answers.length + responses.length) {
            message.channel.send(`${message.author} check variation length`);
            return;
        }
        let flag = true;
        let moves_played = 0;
        let i;
        for (i = 0; i < answers.length; ++i) {
            if (i * 2 >= user_moves.length) break;
            moves_played++;
            if (simplify_move(user_moves[i * 2]) != answers[i]) {
                flag = false;
                break;
            }
            if (i * 2 + 1 >= user_moves.length) break;
            moves_played++;
            if (i < responses.length && simplify_move(user_moves[i * 2 + 1]) != responses[i]) {
                flag = false;
                break;
            }
        }

        if (moves_played <= puzzle_progress * 2) {
            message.channel.send(`${message.author} check previous moves`);
        } else if (moves_played == moves.length && flag) {
            last_move = seconds_forward(2);
            last_answ_id = message.author.id;
            puzzle_active = false;
            puzzle_count++;
            ignore_list = {};
            message.channel.send(`${i-puzzle_progress+1} point${s_or_no(i-puzzle_progress+1)} for ${message.author} for the full variation, puzzle finished`);
            message.channel.send('Solution: **' + variation + '**');

            checkAndCreateUser(message.author.id, message.author.username);
            addAttempt(message.author.id);
            addPoints(message.author.id, i - puzzle_progress + 1);
        } else if (moves_played % 2 == 1 && i == puzzle_progress && !flag) {
            message.channel.send(`${message.author}, wrong on move ${i+1}, your answers will be ignored for ${config.punishment_time} seconds or until the end of this puzzle`);
            ignore(message.author.id, config.punishment_time);
            checkAndCreateUser(message.author.id, message.author.username);
            addAttempt(message.author.id);
        } else if (moves_played % 2 == 1 && !flag) {
            last_move = seconds_forward(2);
            last_answ_id = message.author.id;
            message.channel.send(`${i-puzzle_progress} point${s_or_no(i-puzzle_progress)} for ${message.author}, wrong on move ${i+1}, your answers will be ignored for ${config.punishment_time} seconds or until the end of this puzzle`);
            message.channel.send('Previous moves: **' + prev_moves(i) + '**');
            ignore(message.author.id, config.punishment_time);
            checkAndCreateUser(message.author.id, message.author.username);
            addAttempt(message.author.id);
            addPoints(message.author.id, i - puzzle_progress);

            puzzle_progress = i;
        } else if (moves_played == user_moves.length && flag && moves_played % 2 == 0) {
            last_move = seconds_forward(2);
            last_answ_id = message.author.id;
            message.channel.send(`${i-puzzle_progress} point${s_or_no(i-puzzle_progress)} for ${message.author}`);
            message.channel.send('Previous moves: **' + prev_moves(i) + '**');

            checkAndCreateUser(message.author.id, message.author.username);
            addAttempt(message.author.id);
            addPoints(message.author.id, i - puzzle_progress);

            puzzle_progress = i;
        } else if (user_moves.length >= puzzle_progress * 2) {
            last_move = seconds_forward(2);
            last_answ_id = message.author.id;
            message.channel.send(`${i-puzzle_progress+1} point${s_or_no(i-puzzle_progress+1)} for ${message.author}, response on move ${i+1} is ${real_responses[i]}`);
            message.channel.send('Previous moves: **' + prev_moves(i + 1) + '**');

            checkAndCreateUser(message.author.id, message.author.username);
            addAttempt(message.author.id);
            addPoints(message.author.id, i - puzzle_progress + 1);

            puzzle_progress = i + 1;
        }


    } else if (puzzle_active && message.channel.name == config.channel && message.content.match(move_re) && message.content.match(move_re).length == 1 && !ignore_list[message.author.id]) {
        if (simplify_move(message.content.match(move_re)[0]) == answers[puzzle_progress]) {
            last_move = seconds_forward(2);
            last_answ_id = message.author.id;
            puzzle_progress++;

            if (answers.length == puzzle_progress) {
                message.channel.send(`1 point for ${message.author}` + ', puzzle finished');
                message.channel.send('Solution: **' + variation + '**');
                puzzle_active = false;
                puzzle_count++;
                ignore_list = {};
            } else {
                message.channel.send(`1 point for ${message.author}` + ', response: **' + real_responses[puzzle_progress - 1] + '**');
                message.channel.send('Previous moves: **' + prev_moves(puzzle_progress) + '**');
            }

            checkAndCreateUser(message.author.id, message.author.username);
            addAttempt(message.author.id);
            addPoints(message.author.id, 1);
        } else if (new Date() > last_move || message.author == last_answ_id) {
            message.channel.send(`${message.author} wrong, your answers will be ignored for ${config.punishment_time} seconds or until the end of this puzzle`);
            ignore(message.author.id, config.punishment_time);

            checkAndCreateUser(message.author.id, message.author.username);
            addAttempt(message.author.id);
        }
    }
});



client.login(config.token);
