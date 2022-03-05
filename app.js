let express = require('express');
let http = require('http');
let path = require('path');
let socketIO = require('socket.io');
let app = express();
let cron = require('node-cron');
const { exec } = require('child_process');
let server = http.Server(app);
const mysql = require("mysql2");
const fs = require("fs");
let rawdata = fs.readFileSync('../config/config.json');
let conf = JSON.parse(rawdata);
let date = thsDate();
const ip = "http://" + conf['ip'];
let io = socketIO(server, {
   cors: {
     origin: ip,
     methods: ["GET", "POST"]
   }
});
let whatToPlay = 0;

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

   socket.on('playThisFile', function(data) {
      whatToPlay = data;
   });
  
   socket.on('disconnect', function(){
      console.log('A user disconnected');
   });
   
});

function actualStatusMpc(socket, sounds) {                     //update player data 

   exec('/usr/bin/mpc status', (error, stdout, stderr) => {
      if(error) {
         console.error(`error: ${error.message}`);
         let write = date[0] + ' actualStatusMpc error ' + error + '\n';
         fs.appendFile("serverLog.txt", write, function() {});
         return;
      }

      if(stderr) {
         console.error(`stderr: ${stderr}`);
         let write = date[0] + ' actualStatusMpc error ' + stderr + '\n';
         fs.appendFile("serverLog.txt", write, function() {});
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
         let write = date[0] + ' updatePlaylists error ' + err + '\n';
         fs.appendFile("serverLog.txt", write, function() {});
         return;
      }
      
      if(!comparePlaylists(playlists, results)){
         playlists.splice(0, playlists.length);
         results.forEach(function(item, i, arr){                              
            playlists[i] = item;
         });
         socket.emit('updatePlaylists');
      }
   });
   connection.end();
}

cron.schedule('*/10 * * * * *', function() {
   cronTab();
});

function cronTab(){
   if (whatToPlay){                                            //если выбран mp3 файл
      exec('/usr/bin/mpc clear');
      playThisFile(whatToPlay);                                //играть файл
      whatToPlay = 0;
      return;
   }

   exec('/usr/bin/mpc status', (error, stdout, stderr) => {    //статус проигрывателя
      if(error) {
         console.error(`error: ${error.message}`);
         return;
      }
      if(stderr) {
         console.error(`stderr: ${stderr}`);
         return;
      }
      stdout = stdout.trim().split('\n');                      //разбить статус плеера по разрыву строки
      let status;                                              //равен или playing или pause или stop
      let singleMode =  stdout[stdout.length - 1].split(' ').join('').split('consume').shift().split(':').pop();     //режим одиночного проигрывания. Равен либо on либо off
            
      if((stdout.length > 2)&&(stdout[0].substring(0, 3) != 'vol')){       //если статус плеера playing или pause        
         status = stdout[1].split('#').shift().trim().slice(1,-1);         //получение статуса
         if(singleMode == 'on'){                                           //если статус плеера не stop и играет одиночный файл                           
            return;
         }   
      }else{   
         status = 'stop';
         if(singleMode == 'on'){                               //если режим одиночного проигрывания включен, но ничего не играет                                                             
            exec('/usr/bin/mpc single off');                   //то выключить этот режим
         }                                                 
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
      const playlist = [date[2], date[2]];
      let connection = makeConnection(mysql);
      connection.query(sql, playlist, function(err, file) {                      //получить плейлист, который должен играть
         if(err) {
            let write = date[0] + ' crontab ' + err + '\n';
            fs.appendFile("serverLog.txt", write, function() {});
         }
         connection.query('SELECT * FROM `playlist` WHERE playing = 1', function(err, currentPlayingFile) {       //получить плейлист с playing == 1
            if(err) {
               let write = date[0] + ' crontab ' + err + '\n';
               fs.appendFile("serverLog.txt", write, function() {});
            }

            if(status == 'paused'){
               exec('/usr/bin/mpc toggle');
            }

            if((file.length == 0) && (currentPlayingFile.length == 0)){          //если ничего играть не должно
               if(status != 'stop'){                                             //если что-то играет - остановить
                  exec('/usr/bin/mpc clear');
               }
            }else if((file.length != 0) && (currentPlayingFile.length == 0)){    //что-то должно играть, но не играет
               exec('/usr/bin/mpc clear');
               connection.query('UPDATE `playlist` SET `playing` = 0 WHERE playing = 1');
               exec('/usr/bin/mpc load ' + file[0]['file'] + ' & mpc toggle'); 
               connection.query("UPDATE `playlist` SET `playing` = 1 WHERE id = " + file[0]['id']);
            }else if((file.length == 0) && (currentPlayingFile.length != 0)){    //если не должно играть, а играет
               connection.query('UPDATE `playlist` SET `playing` = 0 WHERE playing = 1');
               exec('/usr/bin/mpc clear');
            }else if((file.length != 0) && (currentPlayingFile.length != 0)){    //если должно что-то играть
               if(file[0]['id'] != currentPlayingFile[0]['id']){                 //если играет не тот плейлист
                  exec('/usr/bin/mpc clear');
                  connection.query('UPDATE `playlist` SET `playing` = 0 WHERE playing = 1');
                  exec('/usr/bin/mpc load ' + file[0]['file'] + ' & mpc toggle'); 
                  connection.query("UPDATE `playlist` SET `playing` = 1 WHERE id = " + file[0]['id']);
               }else{
                  if(status == 'stop') {  
                     exec('/usr/bin/mpc clear');
                     connection.query('UPDATE `playlist` SET `playing` = 0 WHERE playing = 1');
                     connection.query("UPDATE `playlist` SET `playing` = 1 WHERE id = " + file[0]['id']);                 
                     exec('/usr/bin/mpc load ' + file[0]['file'] + ' & mpc toggle');                  
                  }
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
   date[0] = thisDate.getDate() + '.' + (thisDate.getMonth() + 1) + ' ' + thisDate.getHours() + ':' + thisDate.getMinutes() + ':' + thisDate.getSeconds();
   date[1] = thisDate.getDay();
   date[2] = thisDate.getHours() + ':' + thisDate.getMinutes() + ':' + thisDate.getSeconds();
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

function playThisFile(id) {
   let date = thsDate();
   let sql = "select file from souds where id = ?";
   const connection = makeConnection(mysql);
   const selectThis = [id];
   connection.query(sql, selectThis, function(err, file) {
      if(err) {
         let write = date[0] + ' crontab ' + err + '\n';
         fs.appendFile("serverLog.txt", write, function() {});
         return;
      }
      exec('/usr/bin/mpc add ' + file[0]['file'] + ' & mpc single on & mpc toggle');
   });
}
