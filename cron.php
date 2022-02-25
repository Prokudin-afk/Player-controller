<?php
include_once ('class/Core.php');
//2 проверить, должно ли сейчас что-то играть
$core = new Core();
date_default_timezone_set('Asia/Yekaterinburg');    //установить часовой пояс
$time = date('H:i:s', time());
$day = date('N', time());

$str = $core->getStatusMpc();
$file = $core->getPlayListByTime($day, $time);      //текущий плейлист
$currentPlayingFile = $core->getPlayingPlaylist();  //плейлист с playing=1
echo $day . " " . $time . " " . $file['file'] . "\n";
if($file == null && $str != "stop"){
    exec('/usr/bin/mpc clear');                       //если сейчас не должно ничего играть, а играет, то остановить проигрывание
    die();
}

if($file['file'] != $currentPlayingFile['file']){   //если сейчас играет один плейлист, а должен играть другой
    $core->setStopStatus();                         //установить пассивный статус играющему плейлисту
    exec('/usr/bin/mpc clear & mpc load '.$file['file'].' & mpc toggle');    //играть нужный плейлист
    $core->setStartFor($file['id']);                //установить текущему плейлисту статус активного
    die();
}

if($str == "stop"){
    exec('/usr/bin/mpc clear & mpc load '.$file['file'].' & mpc toggle');
    $core->setStartFor($file['id']);
    die();
}

if(($file != null) && ($str != 'stop') && ($str == 'paused')){
    exec('/usr/bin/mpc toggle');
}
