/**
 * Executor pour les outils d'administration
 * Couvre: gestion utilisateurs (add/remove/list), alertes (create/list/delete), restart bot
 */

import type { ExecutorContext, ExecutorHelpers } from './types';
import {
  getAllAuthorizedUsers,
  getUserByChatId,
  addAuthorizedUser,
  removeAuthorizedUser,
  hasPermission,
  getPermissionDeniedMessage,
} from '../../database';

const HANDLED = new Set([
  'add_user',
  'remove_user',
  'list_users',
  'create_alert',
  'list_alerts',
  'delete_alert',
  'restart_bot',
]);

export async function executeAdminFunction(
  functionName: string,
  args: Record<string, any>,
  ctx: ExecutorContext,
  _helpers: ExecutorHelpers
): Promise<string | null> {
  if (!HANDLED.has(functionName)) return null;

  let result: Record<string, unknown>;

  switch (functionName) {
    case 'add_user': {
      // Vérification de permissions
      if (ctx.chatId && !hasPermission(ctx.chatId, 'add_user')) {
        result = { success: false, error: 'permission_denied', message: getPermissionDeniedMessage('add_user') };
        break;
      }
      // Ajouter un utilisateur autorisé à la base de données SQLite
      const chatIdToAdd = args.chat_id?.trim();
      const usernameToAdd = args.username?.trim() || null;

      // Validation
      if (!chatIdToAdd) {
        result = {
          success: false,
          error: 'missing_chat_id',
          message: '❌ Veuillez spécifier un Chat ID.\n\nExemple: "Ajoute l\'utilisateur 123456789"\n\n💡 Pour trouver votre Chat ID, parlez au bot @userinfobot sur Telegram.',
        };
        break;
      }

      if (!/^\d+$/.test(chatIdToAdd)) {
        result = {
          success: false,
          error: 'invalid_chat_id',
          message: `❌ Chat ID invalide: "${chatIdToAdd}"\n\nUn Chat ID doit contenir uniquement des chiffres.`,
        };
        break;
      }

      try {
        // Vérifier si l'utilisateur existe déjà
        const existingUser = getUserByChatId(chatIdToAdd);
        if (existingUser) {
          result = {
            success: false,
            error: 'already_exists',
            message: `⚠️ L'utilisateur avec le Chat ID "${chatIdToAdd}" est déjà autorisé.`,
          };
          break;
        }

        // Ajouter le nouvel utilisateur
        const success = addAuthorizedUser(chatIdToAdd, usernameToAdd, 'user', 'ai_assistant');

        if (!success) {
          result = {
            success: false,
            error: 'database_error',
            message: `❌ Erreur lors de l'ajout de l'utilisateur.`,
          };
          break;
        }

        // Récupérer le total d'utilisateurs
        const allUsers = getAllAuthorizedUsers();
        const username = usernameToAdd || 'Inconnu';

        result = {
          success: true,
          chat_id: chatIdToAdd,
          username: username,
          total_users: allUsers.length,
          message: `✅ Utilisateur ajouté avec succès !\n\n📱 Chat ID: <b>${chatIdToAdd}</b>${username !== 'Inconnu' ? ` (${username})` : ''}\n👥 Total utilisateurs: ${allUsers.length}\n\n✅ Changements appliqués immédiatement (pas besoin de redémarrage).`,
        };
      } catch (error: any) {
        result = {
          success: false,
          error: 'database_error',
          message: `❌ Erreur lors de l'ajout de l'utilisateur: ${error.message}`,
        };
      }
      break;
    }

    case 'remove_user': {
      // Vérification de permissions
      if (ctx.chatId && !hasPermission(ctx.chatId, 'remove_user')) {
        result = { success: false, error: 'permission_denied', message: getPermissionDeniedMessage('remove_user') };
        break;
      }
      // Supprimer un utilisateur autorisé depuis la base de données SQLite
      const chatIdToRemove = args.chat_id?.trim();

      // Validation
      if (!chatIdToRemove) {
        result = {
          success: false,
          error: 'missing_chat_id',
          message: '❌ Veuillez spécifier un Chat ID.\n\nExemple: "Supprime l\'utilisateur 123456789"',
        };
        break;
      }

      if (!/^\d+$/.test(chatIdToRemove)) {
        result = {
          success: false,
          error: 'invalid_chat_id',
          message: `❌ Chat ID invalide: "${chatIdToRemove}"\n\nUn Chat ID doit contenir uniquement des chiffres.`,
        };
        break;
      }

      try {
        // Vérifier si l'utilisateur existe
        const existingUser = getUserByChatId(chatIdToRemove);
        if (!existingUser) {
          result = {
            success: false,
            error: 'not_found',
            message: `⚠️ L'utilisateur avec le Chat ID "${chatIdToRemove}" n'existe pas dans la liste.`,
          };
          break;
        }

        // Vérifier qu'il restera au moins un utilisateur
        const allUsers = getAllAuthorizedUsers();
        if (allUsers.length <= 1) {
          result = {
            success: false,
            error: 'cannot_remove_last',
            message: '❌ Impossible de supprimer le dernier utilisateur autorisé. Il doit toujours y avoir au moins un utilisateur.',
          };
          break;
        }

        // Supprimer l'utilisateur (désactive dans la BD)
        const success = removeAuthorizedUser(chatIdToRemove);

        if (!success) {
          result = {
            success: false,
            error: 'database_error',
            message: `❌ Erreur lors de la suppression de l'utilisateur.`,
          };
          break;
        }

        const username = existingUser.username || 'Inconnu';
        const remainingUsers = getAllAuthorizedUsers();

        result = {
          success: true,
          chat_id: chatIdToRemove,
          username: username,
          total_users: remainingUsers.length,
          message: `✅ Utilisateur supprimé avec succès !\n\n📱 Chat ID: <b>${chatIdToRemove}</b>${username !== 'Inconnu' ? ` (${username})` : ''}\n👥 Total utilisateurs: ${remainingUsers.length}`,
        };
      } catch (error: any) {
        result = {
          success: false,
          error: 'database_error',
          message: `❌ Erreur lors de la suppression de l'utilisateur: ${error.message}`,
        };
      }
      break;
    }

    case 'list_users': {
      // Lister tous les utilisateurs autorisés depuis la base de données SQLite
      try {
        const users = getAllAuthorizedUsers();

        if (users.length === 0) {
          result = {
            success: false,
            error: 'empty_list',
            message: '❌ Aucun utilisateur autorisé n\'est configuré.',
          };
          break;
        }

        const usersList = users.map((user, index) => {
          const username = user.username || 'Inconnu';
          const roleLabel = user.role === 'owner' ? '👑' : user.role === 'admin' ? '⭐' : '';
          return `${index + 1}. Chat ID: <b>${user.chat_id}</b>${username !== 'Inconnu' ? ` (${username})` : ''} ${roleLabel}`;
        }).join('\n');

        const formattedMessage = `👥 Utilisateurs autorisés (${users.length})\n\n${usersList}`;

        result = {
          success: true,
          direct_response: formattedMessage,
          message: formattedMessage,
        };
      } catch (error: any) {
        result = {
          success: false,
          error: 'database_error',
          message: `❌ Erreur lors de la récupération des utilisateurs: ${error.message}`,
        };
      }
      break;
    }

    // 🚀 OUTIL 10: Système d'alertes personnalisées
    case 'create_alert': {
      // Créer une alerte personnalisée
      try {
        const userId = ctx.chatId || '0';
        const { type, threshold, description } = args;

        // Validation
        if (!type || !threshold) {
          result = {
            success: false,
            error: 'missing_params',
            message: '❌ Paramètres manquants. Type et seuil requis.',
          };
          break;
        }

        const validTypes = ['unpaid_threshold', 'overdue_count', 'balance_below', 'large_expense'];
        if (!validTypes.includes(type)) {
          result = {
            success: false,
            error: 'invalid_type',
            message: `❌ Type invalide. Types acceptés : ${validTypes.join(', ')}`,
          };
          break;
        }

        const alert = ctx.alertService.createAlert(userId, type, threshold, description);

        const typeLabels = {
          unpaid_threshold: '💰 Factures impayées',
          overdue_count: '⏰ Factures en retard',
          balance_below: '📊 Balance bancaire',
          large_expense: '💸 Dépense importante'
        };

        const formattedMessage = `✅ Alerte créée avec succès !\n\n` +
          `🔔 Type : ${typeLabels[type as keyof typeof typeLabels]}\n` +
          `📈 Seuil : ${threshold}${type.includes('count') ? ' factures' : '€'}\n` +
          `📝 Description : ${alert.description}\n` +
          `🆔 ID : <code>${alert.id}</code>\n\n` +
          `💡 L'alerte est maintenant active et vous préviendra automatiquement.`;

        result = {
          success: true,
          alert_id: alert.id,
          direct_response: formattedMessage,
          message: formattedMessage,
        };
      } catch (error: any) {
        result = {
          success: false,
          error: 'creation_failed',
          message: `❌ Erreur lors de la création de l'alerte : ${error.message}`,
        };
      }
      break;
    }

    case 'list_alerts': {
      // Lister les alertes de l'utilisateur
      try {
        const userId = ctx.chatId || '0';
        const activeOnly = args.active_only !== false; // Par défaut: true

        const alerts = activeOnly
          ? ctx.alertService.listActiveAlerts(userId)
          : ctx.alertService.listAlerts(userId);

        if (alerts.length === 0) {
          result = {
            success: false,
            error: 'no_alerts',
            message: activeOnly
              ? '❌ Vous n\'avez aucune alerte active.'
              : '❌ Vous n\'avez aucune alerte configurée.',
          };
          break;
        }

        const typeLabels = {
          unpaid_threshold: '💰 Factures impayées',
          overdue_count: '⏰ Factures en retard',
          balance_below: '📊 Balance bancaire',
          large_expense: '💸 Dépense importante'
        };

        const alertsList = alerts.map((alert, index) => {
          const status = alert.enabled ? '🟢' : '🔴';
          const type = typeLabels[alert.type as keyof typeof typeLabels];
          const threshold = `${alert.threshold}${alert.type.includes('count') ? ' factures' : '€'}`;
          return `${index + 1}. ${status} ${type}\n   Seuil : ${threshold}\n   ID : <code>${alert.id}</code>`;
        }).join('\n\n');

        const formattedMessage = `🔔 Vos alertes ${activeOnly ? 'actives' : ''} (${alerts.length})\n\n${alertsList}`;

        result = {
          success: true,
          alerts_count: alerts.length,
          direct_response: formattedMessage,
          message: formattedMessage,
        };
      } catch (error: any) {
        result = {
          success: false,
          error: 'list_failed',
          message: `❌ Erreur lors de la récupération des alertes : ${error.message}`,
        };
      }
      break;
    }

    case 'delete_alert': {
      // Supprimer une alerte
      try {
        const userId = ctx.chatId || '0';
        const { alert_id } = args;

        if (!alert_id) {
          result = {
            success: false,
            error: 'missing_alert_id',
            message: '❌ Veuillez spécifier l\'ID de l\'alerte à supprimer.',
          };
          break;
        }

        const deleted = ctx.alertService.deleteAlert(userId, alert_id);

        if (!deleted) {
          result = {
            success: false,
            error: 'not_found',
            message: `❌ Alerte introuvable avec l'ID : ${alert_id}`,
          };
          break;
        }

        const formattedMessage = `✅ Alerte supprimée avec succès !\n\n🆔 ID : <code>${alert_id}</code>`;

        result = {
          success: true,
          direct_response: formattedMessage,
          message: formattedMessage,
        };
      } catch (error: any) {
        result = {
          success: false,
          error: 'deletion_failed',
          message: `❌ Erreur lors de la suppression de l'alerte : ${error.message}`,
        };
      }
      break;
    }

    case 'restart_bot': {
      // Vérification de permissions (owner uniquement)
      if (ctx.chatId && !hasPermission(ctx.chatId, 'restart_bot')) {
        result = { success: false, error: 'permission_denied', message: getPermissionDeniedMessage('restart_bot') };
        break;
      }
      // Redémarrer le bot
      result = {
        success: true,
        message: '🔄 Redémarrage du bot en cours...\n\n⏳ Le bot sera de retour dans quelques secondes.',
      };

      // Envoyer la réponse immédiatement, puis redémarrer après un court délai
      setTimeout(() => {
        console.log('🔄 Redémarrage du bot initié via restart_bot...');
        console.log('💾 Sauvegarde de l\'état de conversation...');

        // Sauvegarder la conversation actuelle
        if (ctx.onBeforeRestart) ctx.onBeforeRestart();

        console.log('✅ Arrêt du bot...');
        process.exit(0); // Code de sortie 0 pour redémarrage propre
      }, 1000);

      break;
    }

    default:
      return null;
  }

  return JSON.stringify(result, null, 2);
}
