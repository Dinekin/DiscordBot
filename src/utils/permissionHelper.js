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
  
  module.exports = { hasModeratorPermissions };