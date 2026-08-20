/**
 * public/js/ui/bots.js
 * Render bot grid cards dan update status summary di header.
 */

function updateBotsSection(bots) {
  if (!Array.isArray(bots)) return;
  currentBotsData = bots;

  // Deteksi perubahan status untuk alert
  bots.forEach(function(bot, idx) {
    var prevStatus = previousBotsStatuses[idx];
    if (prevStatus !== undefined && prevStatus !== bot.status) {
      if (bot.status === 'Error' || bot.status === 'Disconnected') {
        triggerWarningAlert(bot.name, bot.status);
      }
    }
    previousBotsStatuses[idx] = bot.status;
  });

  var onlineCount = bots.filter(function(b) { return b.status === 'Online'; }).length;
  var inVcCount   = bots.filter(function(b) { return b.connectedChannelId; }).length;

  setText('active-bots-badge', onlineCount + ' / ' + bots.length + ' Bots Online');
  setText('bot-count-text',    onlineCount + ' / ' + bots.length);
  setText('bot-vc-summary',    inVcCount + ' Bot Aktif di Voice Channel');

  var onlineBots = bots.filter(function(b) { return b.ping > 0; });
  if (onlineBots.length > 0) {
    var avg = Math.round(onlineBots.reduce(function(s, b) { return s + b.ping; }, 0) / onlineBots.length);
    setText('avg-ping', 'Ping: ' + avg + ' ms');
  } else {
    setText('avg-ping', 'Ping: -- ms');
  }

  var container = document.getElementById('bots-grid-container');
  if (!container) return;

  if (bots.length === 0) {
    container.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-robot"></i> Belum ada bot. Klik <strong>"Tambah Bot"</strong> untuk menambahkan.</div>';
    return;
  }

  container.innerHTML = bots.map(function(bot, idx) {
    return renderBotCard(bot, idx);
  }).join('');
}

function renderBotCard(bot, idx) {
  var isOnline   = bot.status === 'Online';
  var badgeClass = isOnline ? 'badge-success' : (bot.status === 'Stopped' ? 'badge-danger' : 'badge-warning');
  var avatarUrl  = bot.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';

  var lifecycleBtn = isOnline
    ? '<button class="btn btn-sm btn-warning" onclick="controlLifecycle(' + idx + ',\'restart\')"><i class="fa-solid fa-rotate-right"></i></button>' +
      '<button class="btn btn-sm btn-danger"  onclick="controlLifecycle(' + idx + ',\'stop\')"   ><i class="fa-solid fa-stop"></i></button>'
    : '<button class="btn btn-sm btn-primary" onclick="controlLifecycle(' + idx + ',\'start\')"><i class="fa-solid fa-play"></i></button>';

  return '<div class="bot-card">' +
    '<div class="bot-card-top">' +
      '<div class="bot-profile">' +
        '<img src="' + avatarUrl + '" alt="Avatar" class="bot-avatar">' +
        '<div class="bot-info-text">' +
          '<h3>' + esc(bot.name) + '</h3>' +
          '<span class="bot-tag">' + esc(bot.tag || 'Not Logged In') + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="badge ' + badgeClass + '">' + bot.status + '</span>' +
    '</div>' +
    '<div class="bot-vc-box">' +
      '<div class="vc-detail-row">' +
        '<span class="vc-channel-name">' +
          '<i class="fa-solid fa-volume-high"></i> ' +
          esc(bot.connectedChannelName || bot.defaultVoiceChannelId || 'Tidak Terhubung') +
        '</span>' +
        '<div class="vc-flags">' +
          '<span class="flag-icon ' + (bot.selfMute ? 'active' : '') + '" title="' + (bot.selfMute ? 'Muted' : 'Unmuted') + '">' +
            '<i class="fa-solid ' + (bot.selfMute ? 'fa-microphone-slash' : 'fa-microphone') + '"></i>' +
          '</span>' +
          '<span class="flag-icon ' + (bot.selfDeaf ? 'active' : '') + '" title="' + (bot.selfDeaf ? 'Deafened' : 'Undeafened') + '">' +
            '<i class="fa-solid ' + (bot.selfDeaf ? 'fa-headphones-simple' : 'fa-headphones') + '"></i>' +
          '</span>' +
        '</div>' +
      '</div>' +
      '<div class="vc-detail-row" style="font-size:0.78rem;color:var(--text-dim)">' +
        '<span><i class="fa-solid fa-server"></i> ' + esc(bot.guildName || bot.guildId) + '</span>' +
        '<span><i class="fa-solid fa-bolt"></i> ' + (bot.ping ? bot.ping + ' ms' : '--') + '</span>' +
      '</div>' +
      (bot.targetUserId ? '<div class="vc-detail-row text-cyan" style="font-size:0.78rem"><span><i class="fa-solid fa-user-gear"></i> Follow: ' + esc(bot.targetUserId) + '</span></div>' : '') +
      (isOnline && bot.presenceText ? '<div class="vc-detail-row text-success" style="font-size:0.78rem"><span><i class="fa-solid fa-eye"></i> ' + esc(bot.presenceType) + ': &quot;' + esc(bot.presenceText) + '&quot;</span></div>' : '') +
    '</div>' +
    '<div class="bot-action-bar">' +
      '<button class="btn btn-sm btn-primary"  onclick="openMoveModal(' + idx + ')" ' + (!isOnline ? 'disabled' : '') + '><i class="fa-solid fa-arrow-right-to-city"></i> Pindah VC</button>' +
      '<button class="btn btn-sm btn-icon ' + (bot.selfMute ? 'btn-danger' : 'btn-secondary') + '" onclick="toggleVoiceState(' + idx + ',\'' + (bot.selfMute ? 'unmute' : 'mute') + '\')" ' + (!isOnline ? 'disabled' : '') + ' title="' + (bot.selfMute ? 'Unmute' : 'Mute') + '"><i class="fa-solid ' + (bot.selfMute ? 'fa-microphone-slash' : 'fa-microphone') + '"></i></button>' +
      '<button class="btn btn-sm btn-icon ' + (bot.selfDeaf ? 'btn-danger' : 'btn-secondary') + '" onclick="toggleVoiceState(' + idx + ',\'' + (bot.selfDeaf ? 'undeafen' : 'deafen') + '\')" ' + (!isOnline ? 'disabled' : '') + ' title="' + (bot.selfDeaf ? 'Undeafen' : 'Deafen') + '"><i class="fa-solid ' + (bot.selfDeaf ? 'fa-headphones-simple' : 'fa-headphones') + '"></i></button>' +
      '<button class="btn btn-sm btn-secondary" onclick="toggleVoiceState(' + idx + ',\'reconnect\')" ' + (!isOnline ? 'disabled' : '') + ' title="Reconnect"><i class="fa-solid fa-arrows-rotate"></i></button>' +
      lifecycleBtn +
      '<button class="btn btn-sm btn-secondary" onclick="openEditBotModal(' + idx + ')" title="Edit"><i class="fa-solid fa-pen"></i></button>' +
      '<button class="btn btn-sm btn-danger"    onclick="deleteBotConfig(' + idx + ')" title="Hapus"><i class="fa-solid fa-trash"></i></button>' +
    '</div>' +
  '</div>';
}
