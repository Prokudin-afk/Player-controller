const ip = "http://192.168.100.31";                   //change this
let express = require('express');
let http = require('http');
let path = require('path');
let socketIO = require('socket.io');
let app = express();
let cron = require('node-cron');
const { exec } = require('child_process');
let server = http.Server(app);
const mysql = require("mysql2");
let io = socketIO(server, {
   cors: {
     origin: ip,
     methods: ["GET", "POST"]
   }
});
const fs = require("fs");
let rawdata = fs.readFileSync('../config/config.json');
let conf = JSON.parse(rawdata);

app.set('port', 3000);

server.listen(3000, function() {
   console.log('listening on *:3000');
});

io.on('connection', function(socket) {    //connection event
   console.log('A user connected');

   let sounds = ['test', 'test', 'test'];
   let playlists = [];
   cron.schedule('*/3 * * * * *', function() {
      actualStatusMpc(socket, sounds);
      updatePlaylists(playlists, socket);
   });
  
   socket.on('disconnect', function(){
      console.log('A user disconnected');
   });
   
});

function actualStatusMpc(socket, sounds) {                     //update player data 

   exec('/usr/bin/mpc status', (error, stdout, stderr) => {
      if(error) {
         console.error(`error: ${error.message}`);
         return;
      }

      if(stderr) {
         console.error(`stderr: ${stderr}`);
         return;
      }

      stdout = stdout.trim().split('\n');
      let mpcData = stdout[stdout.length - 1].replace(/\s+/g, ' ').trim().split('  ');
      let volume = mpcData[0].split(':')[1].split('%').shift().trim();        //получение громкости

      let actualData = [];
      if(stdout.length > 2){
         actualData[0] = stdout[0];                                           //get track
         actualData[1] = stdout[1].split('#').shift().trim().slice(1,-1);     //get status
         actualData[2] = volume;                                              //get volume
      }else{
         actualData[0] = 'player stopped';
         actualData[1] = 'stop';
         actualData[2] = volume;
      }

      let countUpdate = 0;
      sounds.forEach(function(item, i, arr) {
         if(item != actualData[i]){
            sounds[i] = actualData[i];
            countUpdate++;
         }
      });
      (countUpdate)?(socket.emit('statusMpc', sounds)):('');
   });
}

function updatePlaylists(playlists, socket){                   //update playlist data
   const connection = makeConnection(mysql);

   connection.query("SELECT * FROM playlist",
   function(err, results) {
      if(err != null){
         console.log(err);
         return;
      }
      
      if(!comparePlaylists(playlists, results)){
         playlists.splice(0, playlists.length);
         results.forEach(function(item, i, arr){                              
            playlists[i] = item;
         });
         socket.emit('updatePlaylists');
         console.log('Сокет зафиксировал изменения плейлистов');
      }
   });

   connection.end();
}

cron.schedule('*/10 * * * * *', function() {
   cronTab();
});

function cronTab(){
   exec('/usr/bin/mpc status', (error, stdout, stderr) => {
      if(error) {
         console.error(`error: ${error.message}`);
         return;
      }
      if(stderr) {
         console.error(`stderr: ${stderr}`);
         return;
      }
      stdout = stdout.split('\n');
      let status;
      if((stdout.length > 2)&&(stdout[0].substring(0, 3) != 'vol')){          
         status = stdout[1].split('#').shift().trim().slice(1,-1);               
      }else{   
         status = 'stop';                                                 
      }

      let sql = "SELECT * FROM web_player.playlist WHERE time_start <= ? AND time_stop >= ? AND ";
      date = thsDate();
      switch (date[1]){
         case 1:
            sql += 'pn = 1';
            break;
         case 2:
            sql += 'vt = 1';
            break;
         case 3:
            sql += 'sr = 1';
            break;
         case 4:
            sql += 'cht = 1';
            break;
         case 5:
            sql += 'pt = 1';
            break;
         case 6:
            sql += 'sb = 1';
            break;
         case 0:
            sql += 'vs = 1';
            break;
      }
      const playlist = [date[0], date[0]];
      let connection = makeConnection(mysql);
      connection.query(sql, playlist, function(err, file) {                      //получить плейлист, который должен играть
         if(err) console.log(err);
         const sql1 = 'SELECT * FROM `playlist` WHERE playing = 1';
         connection.query(sql1, function(err, currentPlayingFile) {              //получить плейлист с playing == 1
            if(err) console.log(err);
            
            if((file.length == 0) && (currentPlayingFile.length == 0)){          //если ничего играть не должно
               if(status != 'stop'){                                             //если что-то играет - остановить
                  exec('/usr/bin/mpc clear');

                  let write = date[0] + ' очистил очередь' + '\n';
                  fs.appendFile("serverLog.txt", write, function() {});
               }
            }else if((file.length != 0) && (currentPlayingFile.length == 0)){    //что-то должно играть, но не играет
               const sql2 = 'UPDATE `playlist` SET `playing` = 0 WHERE playing = 1';
               connection.query(sql2);
               exec('/usr/bin/mpc clear & mpc load ' + file[0]['file'] + ' & mpc toggle'); 
               const sql3 = "UPDATE `playlist` SET `playing` = 1 WHERE id = " + file[0]['id'];
               connection.query(sql3);

               let write = date[0] + ' запустил проигрывание' + '\n';
               fs.appendFile("serverLog.txt", write, function() {});
            }else if((file.length == 0) && (currentPlayingFile.length != 0)){    //если не должно играть, а играет
               const sql4 = 'UPDATE `playlist` SET `playing` = 0 WHERE playing = 1';
               connection.query(sql4);
               if(status != 'stop'){
                  exec('/usr/bin/mpc clear');
               }

               let write = date[0] + ' остановил проигрывание' + '\n';
               fs.appendFile("serverLog.txt", write, function() {});
            }else if((file.length != 0) && (currentPlayingFile.length != 0)){    //если должно что-то играть
               if(file[0]['id'] != currentPlayingFile[0]['id']){                 //играет другой плейлист
                  const sql5 = 'UPDATE `playlist` SET `playing` = 0 WHERE playing = 1';
                  connection.query(sql5);
                  exec('/usr/bin/mpc clear & mpc load ' + file[0]['file'] + ' & mpc toggle'); 
                  const sql6 = "UPDATE `playlist` SET `playing` = 1 WHERE id = " + file[0]['id'];
                  connection.query(sql6);

                  let write = date[0] + ' переключил плейлист' + '\n';
                  fs.appendFile("serverLog.txt", write, function() {});
               }else if(status == 'paused'){
                  exec('/usr/bin/mpc toggle');

                  let write = date[0] + ' снял с паузы' + '\n';
                  fs.appendFile("serverLog.txt", write, function() {});
               }else if(status == 'stop'){
                  exec('/usr/bin/mpc load ' + file[0]['file'] + ' & mpc toggle'); 
                  let write = date[0] + ' запустил проигрывание' + '\n';
                  fs.appendFile("serverLog.txt", write, function() {});
               }
            }
            connection.end();
         });
      });
   });
}

/********************************************************/

function comparePlaylists(playlists, results) {
   let count = 0;

   if(playlists.length != results.length){
      return false;
   }

   results.forEach(function(item, i, arr){                              
      if(
            (playlists[i]['id'] != results[i]['id'])||
            (playlists[i]['name'] != results[i]['name'])||
            (playlists[i]['file'] != results[i]['file'])||
            (playlists[i]['time_start'] != results[i]['time_start'])||
            (playlists[i]['time_stop'] != results[i]['time_stop'])
      ){ count++; }
   });
   return Boolean(!count);
}

function thsDate() {
   let thisDate = new Date;
   thisDate.setHours(thisDate.getHours() + 5);
   let date = [];
   date[0] = thisDate.getHours() + ':' + thisDate.getMinutes() + ':' + thisDate.getSeconds();
   date[1] = thisDate.getDay();
   return date;
}

function makeConnection(mysql) {
   const connection = mysql.createConnection({
      host: conf['host'],
      user: conf['user'],
      database: conf['db'],
      password: conf['password']
  });
  return connection;
}
