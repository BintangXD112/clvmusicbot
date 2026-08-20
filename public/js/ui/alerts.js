/**
 * public/js/ui/alerts.js
 * Alert utilities: Warning notifications and beeping.
 */

function triggerWarningAlert(botName, botStatus) {
  // 1. Desktop Browser Notification
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('Peringatan Bot AFK!', {
      body: 'Bot "' + botName + '" sekarang berstatus: ' + botStatus + '. Silakan periksa koneksi!',
      icon: 'https://cdn.discordapp.com/embed/avatars/0.png'
    });
  }
  
  // 2. Synthesize Warning Beep using Web Audio API
  playWarningBeep();
}

function playWarningBeep() {
  try {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // First high tone beep
    var osc1 = audioCtx.createOscillator();
    var gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.25);
    
    // Second high tone beep (slightly delayed)
    setTimeout(function() {
      var osc2 = audioCtx.createOscillator();
      var gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain2.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.25);
    }, 300);
  } catch (err) {
    console.error('Audio warning beep failed:', err);
  }
}
