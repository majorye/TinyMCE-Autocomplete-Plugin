/**
 * editor_plugin_src.js
 *
 * Copyright 2012, Mijura Pty. Ltd. Released under The MIT License.
 *
 * About:
 * AutoComplete for TinyMCE provides inline autocomplete in a style similar to
 * Twitter or Facebook.  The text you type in tinyMCE is checked
 * against a list of specified options; if there is a match then
 * you will see them appear in a list underneath the caret.
 *
 * Configuration:
 * Parameters that we can use in tinyMCE config:
 * 1\ autocomplete_delimiters - A CSV list of delimiters (ASCII codes) on which
 *      to split text entered into tinyMCE. In most cases you will want to
 *      split text by spaces, in which case you would specify '160,32'. 32 is
 *      a normal space and 160 is &nbsp; (which is commonly used by tinyMCE).
 *      Whichever delimiter you specify first will be inserted after you
 *      select an option.  The default is '160,32' for spaces.
 * 2\ autocomplete_options - A CSV list of autocomplete options.  For
 *      example, 'john,jane,jwilliam'.
 * 3\ autocomplete_trigger -  You can specify a trigger character that must
 *      be type immediately before searching for options.  The default
 *      trigger is '@'
 * 4\ autocomplete_end_option - Any text that you want to be added after the
 *      option.  The caret will be placed between the option and this ending
 *      text.  For example, you could specify 'end', in which case selecting
 *      an autocomplete option would insert: '@jane  @end' with the caret
 *      placed in between (and including the trigger before the end option).
 * 5\ autocomplete_min_length - The minimum number of characters a word needs to have
 *              before the autocomplete activates. Only active when autocomplete_trigger
 *              is ''. The default is 3.
 * 6\ autocomplete_on_select - A function to call after an option is selected.
 *              The default is false.
 * 7\ autocomplete_on_match - A function to call when text entered match only one option.
 *              The default is false.
 *
 * Support:
 * You are welcome to use this plugin at your own risk.  It is currently
 * being maintained on GitHub where you can submit issues / feature requests.
 */

(function () {
  var lastCurrentWord = null;
  var autocomplete_data = {};
  var DOWN_ARROW_KEY = 40;
  var UP_ARROW_KEY = 38;
  var ESC_KEY = 27;
  var ENTER_KEY = 13;
  var TAB_KEY = 9;
  var END_WORD_KEYS = [32, 59, 186, 188, 190];

  function parseOptions(param) {
    return param.options == null && typeof param != "boolean" ? param.split(",") : param.options;
  }

  tinymce.create('tinymce.plugins.AutoCompletePlugin', {

    setOptions: function (param) {
      autocomplete_data.options = parseOptions(param);
    },

    getOptions: function () {
      return autocomplete_data.options;
    },

    init: function (ed, url) {

      autocomplete_data = {
        visible: false,
        cancelEnter: false,
        delimiter: ed.getParam('autocomplete_delimiters', '160,32').split(","),
        options: parseOptions(ed.getParam('autocomplete_options', '')),
        optionsUrl: parseOptions(ed.getParam('autocomplete_options_url', false)),
        trigger: ed.getParam('autocomplete_trigger', '@'),
        enclosing: ed.getParam('autocomplete_end_option', ''),
        minLength: ed.getParam('autocomplete_min_length', '3'),
        onSelect: ed.getParam('autocomplete_on_select', false),
        onMatch: ed.getParam('autocomplete_on_match', false),

        fetchData: ed.getParam('autocomplete_fetch_data', false),
        generateListHtml: ed.getParam('autocomplete_generate_list_function', generateListHtml),
        listCss: ed.getParam('autocomplete_list_css', false)
      };

      autocomplete_data.list = createOptionList();

      var t = this;

      // Setup plugin event
      if (autocomplete_data.onSelect) {
        t.onSelect = new tinymce.util.Dispatcher(t);
        t.onSelect.add(function (ed, selected) {
          ed.execCallback('autocomplete_on_select', ed, selected);
        });
      }
      if (autocomplete_data.onMatch) {
        t.onMatch = new tinymce.util.Dispatcher(t);
        t.onMatch.add(function (ed, match) {
          ed.execCallback('autocomplete_on_match', ed, match);
        });
      }

      /**
       * Search for autocomplete options after text is entered and display the
       * option list if any matches are found.
       */
      function keyUpEvent(ed, e) {
        if ((!autocomplete_data.visible && e.keyCode != ESC_KEY && e.keyCode != ENTER_KEY) || (e.keyCode != DOWN_ARROW_KEY && e.keyCode != UP_ARROW_KEY && e.keyCode != ENTER_KEY && e.keyCode != ESC_KEY)) {
          var currentWord = getCurrentWord(ed);

          if (currentWord.length > 0) {
            populateList(currentWord);
          }

          var wordLessTrigger = currentWord.substring(1);
          //var matches = matchingOptions(wordLessTrigger);

          if (currentWord.length == 0) {
            hideOptionList();
          }
        }
      }


      /**
       * Populates autocomplete list with matched words.
       *
       */
      function populateList(currentWord) {

        var wordLessTrigger = currentWord.substring(1);

        if(autocomplete_data.fetchData) {
          var next = function(options) {
            autocomplete_data.options = options;
            if(options.length > 0) {
              displayOptionList(options, wordLessTrigger, ed);
              highlightNextOption();
            }
          };

          autocomplete_data.fetchData.apply(this, [currentWord, next, {
            ed : ed,
            displayOptionList : displayOptionList,
            highlightNextOption : highlightNextOption,
            matchingOptions : matchingOptions
          }]);
          return;
        }


        if (autocomplete_data.optionsUrl) {
          if (wordLessTrigger.length <= 1)
            return false;

          jQuery.ajax({
            type: "GET",
            url: autocomplete_data.optionsUrl,
            cache: false,
            data: "q=" + wordLessTrigger,
            success: function (data) {
              //hideLoading();
              if (data.ok && data.DATA) {
                var options = [];
                for (var i in data.DATA) {
                  if (data.DATA[i].name)
                    options.push(data.DATA[i].name);
                }
                autocomplete_data.options = options;

                matches = matchingOptions(wordLessTrigger);

                if (matches.length > 0) {
                  displayOptionList(matches, wordLessTrigger, ed);
                  highlightNextOption();
                }
              } else {
                // No data
              }
            },
            error: function (jqXHR, textStatus) {
              // Error
            }
          }); // ajax

        } else {
          matches = matchingOptions(wordLessTrigger);

          if (matches.length > 0) {
            displayOptionList(matches, wordLessTrigger, ed);
            highlightNextOption();
          }
        }
      } // populateList


      /**
       * Prevent return from adding a new line after selecting an option.
       */
      function keyPressEvent(ed, e) {
        if ((e.keyCode == ENTER_KEY || e.keyCode == TAB_KEY) && autocomplete_data.cancelEnter) {
          autocomplete_data.cancelEnter = false;
          return tinymce.dom.Event.cancel(e);
        }
      }

      /**
       * Handle navigation inside the option list when it is visible.
       * These events should not propagate to the editor.
       */
      function keyDownEvent(ed, e) {
        if (autocomplete_data.visible) {
          if (e.keyCode == DOWN_ARROW_KEY) {
            highlightNextOption();
            return tinymce.dom.Event.cancel(e);
          }
          if (e.keyCode == UP_ARROW_KEY) {
            highlightPreviousOption();
            return tinymce.dom.Event.cancel(e);
          }
          if (e.keyCode == ENTER_KEY || e.keyCode == TAB_KEY) {
            selectOption(ed, getCurrentWord(ed));
            autocomplete_data.cancelEnter = true;
            return tinymce.dom.Event.cancel(e);   // the enter evet needs to be cancelled on keypress so
            // it doesn't register a carriage return
          }
          if (e.keyCode == ESC_KEY) {
            hideOptionList();
            return tinymce.dom.Event.cancel(e);
          }
          // onMatch callback
          if (autocomplete_data.onMatch && _.indexOf(END_WORD_KEYS, e.keyCode)) {
            var word = getCurrentWord(ed);
            var matches = matchingOptions(word);
            var completeMatch = new RegExp("^" + matches[0] + "$", "i");
            if (matches.length == 1 && word.match(completeMatch)) {
              t.onMatch.dispatch(ed, matches[0]);
            }
          }
        }
      }

      function clickEvent(ed, e) {
        hideOptionList();
      }


      function generateListHtml(matches, matchedText) {
        var matchesList = "";
        var highlightRegex = new RegExp("(" + matchedText + ")");

        _.each(matches, function(match) {
          if (match.key != null) {
            matchesList += "<li data-value='" + match.key + "'>" + match.key.replace(highlightRegex, "<mark>$1</mark>") + " " + match.description + "</li>";
          }
          else {
            matchesList += "<li data-value='" + match + "'>" + match.replace(highlightRegex, "<mark>$1</mark>") + "</li>";
          }
        });

        return matchesList;
      }

      /**
       * Add all the options to the option list and display it right beneath
       * the caret where the user is entering text. There didn't appear to be
       * an easy way to retrieve the exact pixel position of the caret inside
       * tinyMCE so the difficult method had to suffice.
       */
      function displayOptionList(matches, matchedText, ed) {
        var matchesList = autocomplete_data.generateListHtml(matches, matchedText);

        jQuery(autocomplete_data.list).html(matchesList);

        // work out the position of the caret
        var tinymcePosition = jQuery(ed.getContainer()).position();
        var toolbarPosition = jQuery(ed.getContainer()).find(".mceToolbar").first();
        var nodePosition = jQuery(ed.selection.getNode()).position();
        var textareaTop = 0;
        var textareaLeft = 0;

        var top = tinymcePosition.top + toolbarPosition.innerHeight();
        var left = tinymcePosition.left + 10;

        var version = parseInt($.browser.version, 10);


        // leave left fixed otherwise it gets ugly when at the of the line
        try {

          var fontSize = parseInt(jQuery(ed.selection.getNode()).css("font-size"), 10) / 2;


          if(($.browser.mozilla && version == 1) || ($.browser.msie && version == 9)) {
            textareaTop =  40 + nodePosition.top;
            //textareaLeft = nodePosition.left; //0 is better
            //textareaLeft = ed.selection.getSel().anchorOffset * fontSize;
            //left += textareaLeft;

            top += textareaTop;
          }

          else if($.browser.msie && version <= 8) {
            nodePosition = jQuery(ed.selection.getNode()).position();
            var range = ed.selection.getSel().createRange();

            top = tinymcePosition.top + nodePosition.top + fontSize * 1.3;
            //left = tinymcePosition.left + nodePosition.left + range.offsetLeft;
            //left = tinymcePosition.left;
          }

          else if (ed.selection.getRng().getClientRects().length > 0) {
            textareaTop = ed.selection.getRng().getClientRects()[0].top + ed.selection.getRng().getClientRects()[0].height;
            textareaLeft = ed.selection.getRng().getClientRects()[0].left;

            top += textareaTop + 10;
            //left += textareaLeft;
          }
          else {
            // show at the bottom
            top += jQuery(tinyMCE.activeEditor.getContainer()).height();
          }
        } catch(e) {
          //Firefox
          throw e;
          top += jQuery(tinyMCE.activeEditor.getContainer()).height();
        }


        jQuery(autocomplete_data.list).show().css("top", top)
          .css("left", left)
          .css("display", "block")
          .css("position", 'absolute');

        autocomplete_data.visible = true;
        optionListEventHandlers(ed);
      }



      /**
       * Allow a user to select an option by clicking with the mouse and
       * highlighting the options on hover.
       */
      function optionListEventHandlers(ed) {
        jQuery(autocomplete_data.list).find("li[data-value]").hover(function () {
          jQuery(autocomplete_data.list).find(".selected").removeClass('selected');
          jQuery(this).addClass('selected');
        });
        jQuery(autocomplete_data.list).find("li[data-value]").click(function () {
          selectOption(ed, lastCurrentWord);
        });
      }

      function createOptionList() {
        var ulContainer = document.createElement("ul");
        jQuery(ulContainer).addClass("auto-list");


        if(autocomplete_data.listCss) {
          jQuery(ulContainer).addClass(autocomplete_data.listCss);
        }

        document.body.appendChild(ulContainer);
        return ulContainer;
      }

      function hideOptionList() {
        jQuery(autocomplete_data.list).css("display", "none");
        autocomplete_data.visible = false;
      }

      function highlightNextOption() {
        var current = jQuery(autocomplete_data.list).find(".selected");
        current.removeClass('selected');

        var next = current.nextAll('li[data-value]:eq(0)');
        if (current.size() === 0 || next.size() === 0) {
          jQuery(autocomplete_data.list).find("li[data-value]:eq(0)").addClass('selected');
        } else {
          next.addClass('selected');
        }
      }

      function highlightPreviousOption() {
        var current = jQuery(autocomplete_data.list).find(".selected");
        current.removeClass('selected');

        var prev = current.prevAll( 'li[data-value]:eq(0)');

        if (current.size() == 0 || prev.size() == 0) {
          jQuery(autocomplete_data.list).find("li[data-value]:last-child").addClass('selected');
        } else {
          prev.addClass('selected');
        }
      }

      /**
       * Select/insert the currently selected option.  The option will be inserted at the
       * caret position with a delimiter at the end and the option enclosing text.  If the
       * enclosing text has already been inserted (this would happen when you are editing
       * an autocompleted option), then it won't be inserted again.
       */
      function selectOption(ed, matchedText) {
        var current = jQuery(autocomplete_data.list).find(".selected").attr("data-value");
        if (!current) {
          current = jQuery(autocomplete_data.list).find("li[data-value]:eq(0)").attr("data-value");
        }

        // insert the trigger, selected option and following delimiter
        var delim = "";
        if (autocomplete_data.delimiter.length > 0) {
          delim = String.fromCharCode(autocomplete_data.delimiter[0]);
        }

        var text = autocomplete_data.keepTrigger ?  autocomplete_data.trigger + current + delim : current + delim;


        // modify the range to replace overwrite the option text that has already been entered
        if($.browser.msie) {
          // Support IE

          $(ed.getDoc().body).focus();
          range = ed.getDoc().body.createTextRange();
          range.moveToElementText(ed.selection.getNode());
          range.findText(matchedText, 1, 1 | 2 | 4);
          range.select();
          ed.selection.setContent(text);
          ed.selection.getBookmark();

        } else {
          range = ed.selection.getRng();
          range.setStart(range.startContainer, range.startOffset - matchedText.length);
          ed.selection.setRng(range);
          ed.selection.setContent(text);
        }


        // insert the enclosing text if it has not already been added
        if (autocomplete_data.enclosing.length > 0 && !closingTextExists(content, currentNode)) {
          var content = restOfContent(ed.selection.getSel().anchorNode, "");
          var currentNode = ed.selection.getSel().anchorNode.textContent;
          var middleBookmark = ed.selection.getBookmark();
          ed.selection.setContent(delim + autocomplete_data.trigger + autocomplete_data.enclosing);
          ed.selection.moveToBookmark(middleBookmark);
        }

        // onSelect callback
        if (autocomplete_data.onSelect) {
          t.onSelect.dispatch(ed, current);
        }
        hideOptionList();
      }

      /**
       * Check if the enclosing string has already been placed past the current node.
       */
      function closingTextExists(content, currentNode) {
        var enclosed = autocomplete_data.trigger + autocomplete_data.enclosing;
        content = content.substr(currentNode.length);
        var matches = new RegExp(autocomplete_data.trigger + ".{" + autocomplete_data.enclosing.length + "}", "g").exec(content);
        if (matches != null && matches.length > 0 && matches[0] == enclosed) {
          return true;
        }
        return false;
      }

      /**
       * Recursively find all of the content past (and including) the caret node.
       * This doesn't appear to be available any other way.
       */
      function restOfContent(anchorNode, content) {
        content += anchorNode.textContent;
        if (anchorNode.nextSibling != null) {
          return restOfContent(anchorNode.nextSibling, content);
        }
        return content;
      }

      /**
       * Find all options whose beginning matches the currently entered text.
       */
      function matchingOptions(currentWord) {
        var options = autocomplete_data.options;
        var matches = [];
        _.each(options, function(option) {
          if (option.key == null && (currentWord.length == 0 || beginningOfWordMatches(currentWord, option))) {
            matches.push(option);
          }
          else if (option.key != null && (currentWord.length == 0 || beginningOfWordMatches(currentWord, option.key))) {
            matches.push(option);
          }
        });

        return matches;
      }

      function beginningOfWordMatches(beginning, option) {
        var test = new RegExp("^" + beginning, "i");
        return (option.match(test));
      }

      /**
       * Retrieves the 'word' as specified by the first occurrence of a
       * delimiter prior to the caret position.
       */
      function getCurrentWord(ed) {
        var nodeText = ed.selection.getSel().focusNode == null ? "" : ed.selection.getSel().focusNode.nodeValue;
        var positionInNode = ed.selection.getSel().focusOffset;

        if($.browser.msie && $.browser.version <= 8) {
          var range = ed.selection.getSel().createRange();
          nodeText = ed.selection.getNode().innerText;
          positionInNode = nodeText.length; // range.offsetLeft;
        }

        if (nodeText == null || nodeText.length == 0) {
          return "";
        }
        var lastDelimiter = 0;
        for (var i = 0; i < positionInNode; i++) {
          if ( _.indexOf(autocomplete_data.delimiter, nodeText.charCodeAt(i).toString()) != -1) {
            lastDelimiter = i + 1;
          }
        }
        var word = nodeText.substr(lastDelimiter, positionInNode - lastDelimiter);
        var retWord = "";
        if (autocomplete_data.trigger == '') {
          if (word.length >= autocomplete_data.minLength) {
            retWord = word;
          }
        } else {

          if (word.length > 0) {
            var letter = word.charAt(0).toString();

            // support multiple delimiters
            if( (typeof(autocomplete_data.trigger) == 'string' &&  letter == autocomplete_data.trigger) ||
                (typeof(autocomplete_data.trigger) == 'object' && _.include(autocomplete_data.trigger, letter))) {
              retWord = word;
            }
          }
        }

        lastCurrentWord = retWord;

        return retWord;
      }

      ed.onKeyUp.addToTop(keyUpEvent);
      ed.onKeyDown.addToTop(keyDownEvent);
      ed.onKeyPress.addToTop(keyPressEvent);
      ed.onClick.add(clickEvent);
    },

    getInfo: function () {
      return {
        longname: 'AutoComplete',
        author: 'Mijura Pty Ltd',
        authorurl: 'http://mijura.com',
        infourl: 'http://blog.mijura.com',
        version: tinymce.majorVersion + "." + tinymce.minorVersion
      };
    }
  });

  tinymce.PluginManager.add('autocomplete',
                            tinymce.plugins.AutoCompletePlugin);
})();
