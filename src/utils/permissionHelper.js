// Umieść tę funkcję w pliku src/utils/permissionHelper.js

/**
 * Sprawdza, czy użytkownik ma uprawnienia administratora lub moderatora
 * @param {GuildMember} member - Obiekt członka serwera
 * @returns {boolean} - Czy użytkownik ma uprawnienia
 */
function hasModeratorPermissions(member) {
    if (!member || !member.permissions) return false;
    
    return member.permissions.has('Administrator') ||
           member.permissions.has('ManageGuild') ||
           member.permissions.has('ManageRoles') ||
           member.permissions.has('ManageMessages');
  }
  
  function checkServerAccess(user, guildId) {
  if (!user || !user.guilds) return false;
  
  const guild = user.guilds.find(g => g.id === guildId);
  if (!guild) return false;
  
  const ADMIN_PERMISSION = 0x8;          // ADMINISTRATOR
  const MANAGE_GUILD = 0x20;             // MANAGE_GUILD
  const MANAGE_ROLES = 0x10000000;       // MANAGE_ROLES
  const MANAGE_MESSAGES = 0x2000;        // MANAGE_MESSAGES
  
  // Sprawdź czy użytkownik ma którekolwiek z potrzebnych uprawnień
  return (guild.permissions & ADMIN_PERMISSION) === ADMIN_PERMISSION ||
         (guild.permissions & MANAGE_GUILD) === MANAGE_GUILD ||
         (guild.permissions & MANAGE_ROLES) === MANAGE_ROLES ||
         (guild.permissions & MANAGE_MESSAGES) === MANAGE_MESSAGES;
}
  
  module.exports = { hasModeratorPermissions };