var bbcodeParser = require('epochtalk-bbcode-parser');

module.exports = [
  '$scope', '$rootScope', '$timeout', '$window', '$location', '$anchorScroll', 'Session', 'Alert', 'Messages', 'Conversations', 'pageData',
  function($scope, $rootScope, $timeout, $window, $location, $anchorScroll, Session, Alert, Messages, Conversations, pageData) {
    var ctrl = this;
    this.currentUserId = Session.user.id;
    this.recentMessages = pageData.messages;
    this.totalMessageCount = pageData.total_convo_count;
    this.page = pageData.page;
    this.limit = pageData.limit;
    this.pageMax = Math.ceil(pageData.total_convo_count / pageData.limit);
    this.currentConversation = {messages: []};
    this.selectedConversationId = null;
    this.receiverName = null;
    this.newConversation = {body: '', receiver_id: ''};
    this.newMessage = {body: '', receiver_id: '', previewBody: '' };
    this.showReply = false;

    // page exiting functions
    var confirmMessage = 'It looks like a message is being written.';
    var exitFunction = function() {
      if (ctrl.newMessage.body.length) { return confirmMessage; }
    };
    $window.onbeforeunload = exitFunction;
    var routeLeaveFunction = function() {
      return $rootScope.$on('$stateChangeStart', function(e, toState, toParams, fromState) {
        if (toState.url === fromState.url) { return; }
        if (ctrl.newMessage.body.length) {
          var message = confirmMessage + ' Are you sure you want to leave?';
          var answer = confirm(message);
          if (!answer) { e.preventDefault(); }
        }
      });
    };
    var destroyRouteBlocker = routeLeaveFunction();
    $scope.$on('$destroy', function() {
      $window.onbeforeunload = undefined;
      if (destroyRouteBlocker) { destroyRouteBlocker(); }
    });

    // Conversations

    this.loadConversation = function(conversationId) {
      ctrl.selectedConversationId = conversationId;
      Conversations.messages({id: conversationId}).$promise
      // build out conversation information
      .then(function(data) {
        ctrl.currentConversation = data;
        ctrl.currentConversation.members = {};
        loadConversationMembers(data.messages);
        return data;
      })
      // build out reply information
      .then(function(data) {
        ctrl.newMessage = { body: '', previewBody: '' };
        ctrl.newMessage.conversation_id = data.id;
        ctrl.newMessage.sender_id = Session.user.id;
        ctrl.newMessage.sender_username = Session.user.username;
        var lastMessage = data.messages[data.messages.length - 1];
        var lastReceiverId = lastMessage.receiver_id;
        var lastSenderId = lastMessage.sender_id;
        ctrl.receiverName = lastMessage.receiver_username;
        if (Session.user.id === lastSenderId) {
          ctrl.newMessage.receiver_id = lastReceiverId;
          ctrl.newMessage.receiver_username = lastMessage.receiver_username;
        }
        else {
          ctrl.newMessage.receiver_id = lastSenderId;
          ctrl.newMessage.receiver_username = lastMessage.sender_username;
        }
      })
      // scroll last message into view
      .then(function() {
        $anchorScroll();
      });
    };

    this.loadMoreMessages = function() {
      var query = {
        id: ctrl.currentConversation.id,
        timestamp: ctrl.currentConversation.last_message_timestamp,
        messageId: ctrl.currentConversation.last_message_id
      };
      Conversations.messages(query).$promise
      // build out conversation information
      .then(function(data) {
        ctrl.currentConversation.messages = ctrl.currentConversation.messages.concat(data.messages);
        ctrl.currentConversation.last_message_id = data.last_message_id;
        ctrl.currentConversation.last_message_timestamp = data.last_message_timestamp;
        ctrl.currentConversation.hasNext = data.hasNext;
        loadConversationMembers(data.messages);
        return data;
      });
    };

    this.hasMoreMessages = function() { return ctrl.currentConversation.hasNext; };

    function loadConversationMembers(messages) {
      messages.map(function(message) {
        if (message.sender_id !== Session.user.id) {
          ctrl.currentConversation.members[message.sender_id] = message.sender_username;
        }

        if (message.receiver_id !== Session.user.id) {
          ctrl.currentConversation.members[message.receiver_id] = message.receiver_username;
        }

        message.copied.map(function(copied) {
          if (copied.id !== Session.user.id) {
            ctrl.currentConversation.members[copied.id] = copied.username;
          }
        });
      });
    }

    this.showConvoModal = false;
    this.closeConvoModal = function() {
      $timeout(function() {
        ctrl.newConversation = {};
        ctrl.showConvoModal = false;
      });
    };
    this.openConvoModal = function() { ctrl.showConvoModal = true; };
    this.createConversation = function() {
      // create a new conversation id to put this message under
      var newMessage = {
        receiver_id: ctrl.newConversation.receiver_id,
        body: ctrl.newConversation.body,
      };

      Conversations.save(newMessage).$promise
      .then(function(savedMessage) {
        // open conversation
        ctrl.loadConversation(savedMessage.conversation_id);

        // Add message to list
        savedMessage.receiver_username = ctrl.newConversation.receiver_username;
        savedMessage.sender_username = Session.user.username;
        Alert.success('New Conversation Started!');
        ctrl.loadRecentMessages();
      })
      .catch(function() { Alert.error('Failed to create conversation'); })
      .finally(function() { ctrl.showConvoModal = false; });
    };

    // Messages

    this.loadRecentMessages = function(page, limit) {
      if (page <= 0 || page > ctrl.pageMax) { return; }
      page = page || 1;
      limit = limit || 15;
      Messages.latest({ page: page, limit: limit}).$promise
      .then(function(data) {
        ctrl.recentMessages = data.messages;
        ctrl.totalConvoCount = data.total_convo_count;
        ctrl.limit = data.limit;
        ctrl.page = data.page;
        ctrl.pageMax = Math.ceil(data.total_convo_count / data.limit);
      });
    };

    $scope.$watch(function() { return ctrl.newMessage.body; }, function(body) {
      if (body) {
        // BBCode Parsing
        var rawText = body;
        rawText = rawText.replace(/(?:<|&lt;)/g, '&#60;'); // prevent html
        rawText = rawText.replace(/(?:>|&gt;)/g, '&#62;');
        var processed = bbcodeParser.process({text: rawText}).html;
        // re-bind to scope
        ctrl.newMessage.previewBody = processed;
      }
    });

    this.saveMessage = function() {
      Messages.save(ctrl.newMessage).$promise
      .then(function(message) {
        message.receiver_username = ctrl.newMessage.receiver_username;
        message.sender_username = ctrl.newMessage.sender_username;
        message.sender_avatar = Session.user.avatar;
        ctrl.currentConversation.messages.unshift(message);
        Alert.success('Reply sent to ' + message.receiver_username);
      })
      .then(ctrl.loadRecentMessages)
      .then(function() {
        ctrl.newMessage.body = '';
        ctrl.newMessage.previewBody = '';
      })
      .catch(function() { Alert.error('Message could not be sent'); });
    };

    this.deleteMessageId = '';
    this.showDeleteModal = false;
    this.closeDeleteModal = function() {
      $timeout(function() { ctrl.showDeleteModal = false; });
    };
    this.openDeleteModal = function(messageId) {
      ctrl.deleteMessageId = messageId;
      ctrl.showDeleteModal = true;
    };
    this.deleteMessage = function() {
      Messages.delete({id: ctrl.deleteMessageId}).$promise
      .then(function() {
        var messages = [];
        ctrl.currentConversation.messages.forEach(function(message) {
          if (message.id === ctrl.deleteMessageId) { return; }
          else { messages.push(message); }
        });
        ctrl.currentConversation.messages = messages;
        ctrl.loadRecentMessages();
      })
      .catch(function() {Alert.error('Failed to delete message'); })
      .finally(function() { ctrl.showDeleteModal = false; });
    };

  }
];
