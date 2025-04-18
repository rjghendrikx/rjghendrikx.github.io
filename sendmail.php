<?php

/* INTERNAL FIELDS - ContactForm/view/index */
$internalFields = array("replyto", "subject",  "recipient", "email", "frc-captcha-solution", "formLabels", "formLabelsTypeMappings");

/**
 * Validate for email
 *
 * @param string $value
 *
 * @return boolean
 */
function isValidEmail($value) {
    // Based on the information available at https://www.iana.org/domains/root/db
    return preg_match("/^([a-z0-9\+_\-]+)(\.[a-z0-9\+_\-]+)*@([a-z0-9\-]+\.)+[a-z]{2,18}$/ix", $value) && !preg_match("/[\r\n]/", $value);
}

/**
 * Get UTF-8 encoded value
 *
 * @param string $value
 *
 * @return string UTF-8 encoded value
 */
function getUtf8Encoded($value) {
    return "=?UTF-8?B?" . base64_encode($value) . "?=";
}

/**
 * Detect the replyto email from HTTP POST
 * 
 * @return string The reply-to email from the HTTP POST
 */
function getReplyToEmailFromHttpPost() {
    global $internalFields;

    // Some customers may not have email field in the contact form
    $replyToEmail = isset($_POST["replyto"]) ? trim($_POST["replyto"]) : "";

    if (empty($replyToEmail)) {
        foreach ($_POST as $field => $value) {
            if (!in_array($field, $internalFields) && !empty($value) && isValidEmail($value)) {
                $replyToEmail = $value;
            }
        }
    }

    return $replyToEmail;
}

/**
 * Wrap the content in HTML table
 *
 * @param   $tableRows  Array<string>   Table rows in array format
 *
 * @return string
 */
function wrapInTable ($tableRows) {
    return (
        "<table border=\"0\" cellspacing=\"5\" cellpadding=\"0\">" . implode("\r\n", $tableRows) . "</table>"
    );
}

/**
 * Wrap label and value in table tr
 * @param   $field  string  The field label
 * @param   $value  string  The field value
 *
 * @return string
 */
function wrapInTableRow ($field, $value) {
    return (
        "<tr>" .
            "<td><strong>" . $field . ":</strong><td>" .
            "<td>" . $value . "</td>" .
        "</tr>"
    );
}

/**
 * Wrap label and value in div
 *
 * @param   $field  string  The field label
 * @param   $value  string  The field value
 *
 * @return string
 */
function wrapInDiv ($field, $value) {
    return (
        "<div>" .
            "<label><strong>" . $field . ":</strong><label>" .
            "<span>" . $value . "</span>" .
        "</div>"
    );
}

function getRealLabel ($field) {
    if (!empty($_POST["formLabels"])) {
        $arrFormLabels = explode("====", $_POST["formLabels"]);

        $mapFormLabels = array_reduce(
            $arrFormLabels,
            function ($acc, $label) {
                // To match the labels converted by PHP engine
                $newLabel = preg_replace("/[\s\.]/", "_", preg_replace("/^\s+/", "", $label));
                $acc[$newLabel] = $label;
                return $acc;
            },
            []
        );

        return $mapFormLabels[$field] ?: $field;
    }

    return $field;
}

/**
 * Returns the text to be prepended for the message
 *
 * @param   $replyTo            string  The email filled by the website user
 *
 * @return  string
 */
function getTopText () {
    $message = "Je hebt een nieuw bericht ontvangen via het contactformulier op ruudhendrikx.nl.";
    $message = strlen($message) > 0 ? $message : "You received a new message sent via the contact form on ruudhendrikx.nl.";

    return "<p>" . $message . "</p>" . "<br />" . "\r\n";
}

/**
 * Returns the message to be sent
 *
 * @param   $replyTo            string  The email filled by the website user
 * @param   $boundary           string  The mail message boundary string
 * @param   $skipFieldIfEmpty   boolean Flag to determine if empty form fields should be skipped from message
 * @param   $applyFormatting    boolean Convert message to HTML table format
 *
 * @return string
 */
function getMessageToSend ($replyTo, $boundary, $skipFieldIfEmpty = true, $applyFormatting = true) {
    global $internalFields;

    $arrMessage = array();

    foreach($_POST as $field => $value) {
        if (in_array($field, $internalFields)) {
            // Just skip
        } else if ($skipFieldIfEmpty && (!isset($value) || empty($value))) {
            // Do nothing
        } else {
            $realField = htmlspecialchars(ucfirst(getRealLabel($field)));
            $realValue = nl2br(htmlspecialchars($value));

            $message = $applyFormatting ? wrapInTableRow($realField, $realValue) : wrapInDiv($realField, $realValue);
            array_push($arrMessage, $message);
        }
    }

    // In case Marketing consent is part of $_POST, it should be the last field in the mail being composed.
    $keys = array_keys(
        array_filter(
            $arrMessage,
            function ($message) {
                return preg_match("/Marketing Consent/", $message);
            }
        )
    );
    if(count($keys) > 0) {
        $marketingConsent = array_splice($arrMessage, $keys[0], 1);
        array_push($arrMessage, $marketingConsent[0]);
    }

    $message = "\r\n";

    if (!empty($_FILES)) {
        $message .= "--$boundary\r\n";
        $message .= "Content-Type: text/html; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: 7bit\r\n\r\n";
    }

    $message .= getTopText();
    $message .= $applyFormatting ? wrapInTable($arrMessage) : implode("\r\n", $arrMessage);

    return $message;
}


/**
 * Validate the HTTP request method
 *
 * @param   $requestMethod  string  The HTTP request method
 *
 * @return boolean
 */
function validateRequestMethod($requestMethod) {
    return "POST" === strtoupper($requestMethod);
}

/**
 * Validate the requester
 *
 * @param   $referer    string  The requester domain
 *
 * @return boolean
 */
function isValidReferer() {
    $referer = $_SERVER['HTTP_HOST'] ?: null;
    // The value in placeholders for requester and domainname will be replaced during publish prcess
    return stripos($referer, "ruudhendrikx.nl") !== false || stripos($referer, "oneconnect.one.com") !== false;
}

/**
 * Converts attacments as message body with appropriate message boundary
 *
 * @param   $boundary   string  The mail message boundary string
 *
 * @return string
 */
function getAttachmentsAsMessage ($boundary) {
    $attachmentMessage = "\r\n";

    if (!empty($_FILES)) {
        foreach ($_FILES as $file) {
            if ($file['error'] == UPLOAD_ERR_OK) {
                $fileContent = file_get_contents($file['tmp_name']);
                $fileName = $file['name'];
                $fileType = $file['type'];
                
                $attachmentMessage .= "--{$boundary}\r\n";
                $attachmentMessage .= "Content-Type: {$fileType}; name=\"{$fileName}\"\r\n";
                $attachmentMessage .= "Content-Disposition: attachment; filename=\"{$fileName}\"\r\n";
                $attachmentMessage .= "Content-Transfer-Encoding: base64\r\n\r\n";
                $attachmentMessage .= chunk_split(base64_encode($fileContent)) . "\r\n";
            }
        }

        $attachmentMessage .= "--$boundary--\r\n";
    }

    return $attachmentMessage;
}

function getContentType () {
    return empty($_FILES) ? "text/html; charset=UTF-8;" : "multipart/mixed;";
}

/**
 * Generate the required headers
 *
 * @param   $from       string  The from email id
 * @param   $replyTo    string  The reply to email id
 * @param   $boundary   string  The mail message boundary string
 *
 * @return string
 */
function getMailHeaders ($from, $replyTo, $boundary) {
    $headers = array(
        "From: $from",
        "Reply-To: $replyTo",
        "MIME-Version: 1.0",
        implode(" ", array("Content-Type:", getContentType(), "boundary=\"$boundary\"")),
        "Message-ID: <" . implode("@", [md5(uniqid(time())), "ruudhendrikx.nl"]) . ">",
        "Date: ".date("r (T)"),
        "X_Mailer: PHP/" . phpversion(),
    );

    return implode("\r\n", $headers);
}

function getDebugInfo() {
    $debugInfo = "";

    $debugHeader = isset($_SERVER['X-Mail-Debug']) ? $_SERVER['X-Mail-Debug'] : "";

    if (isValidReferer() || (!empty($debugHeader) && $debugHeader === "ruudhendrikx.nl")) {
        $lastError = error_get_last();

        $debugInfo= $lastError && is_array($lastError)
            ? ("Message: " . $lastError["message"] . " Line: " . $lastError["line"])
            : "Could not get last error";
    }

    return $debugInfo;
}

/**
 * Handle the mail sending along with validation 
 */
function processMail() {
    $response = array();

    $httpResponseCode = 200;

    // Validations
    if (!isValidReferer()) {
        $response['success'] = false;
        $response['error'] = 'HTTP referer mismatch';
    }

    if (empty($response)) {
        $requestMethod = $_SERVER['REQUEST_METHOD'] ?: null;
        if (!validateRequestMethod($requestMethod)) {
            $response['success'] = false;
            $response['error'] = 'HTTP request method mismatch';
        }
    }

    if (empty($response)) {
        $recipient = $_POST['recipient'] ?: '';

        if (empty($recipient) || !isValidEmail($recipient)) {
            $response['success'] = false;
            $response['error'] = 'Invalid recipient email address';
        }

        function toLower ($str) {
            return strtolower($str);
        }

        $contactFormEmails = json_decode('[]');
        if (
            is_array($contactFormEmails) &&
            count($contactFormEmails) > 0 &&
            in_array(toLower($recipient), array_map('toLower', $contactFormEmails)) === false
        ) {
            $response['success'] = false;
            $response['error'] = $recipient.' not found in the Contact Form List';
        }

        if (empty($response)) {
            $from = "" ?: $recipient;

            $replyTo = getReplyToEmailFromHttpPost();
            if (empty($replyTo)) {
                $replyTo = $from;
            }

            $boundary = md5(time());

            // Get Headers
            $headers = getMailHeaders($from, $replyTo, $boundary);

            // Get subject
            $subject = getUtf8Encoded($_POST['subject']);

            // Get message body with attachments
            $message = "";

            $message .= getMessageToSend($replyTo, $boundary);
            $message .= getAttachmentsAsMessage($boundary);

            $additional_params = "-f " . $from;

            $additionalParamAllowed = strtolower("no");

            if ($additionalParamAllowed === "yes") {
                $success = mail($recipient, $subject, $message, $headers, $additional_params);
            } else {
                $success = mail($recipient, $subject, $message, $headers);
            }

            $response['success'] = $success;
            $response['error'] = "";

            if (!$success) {
                $httpResponseCode  = 500;
                $response['error'] = "Error sending mail";

                $debugInfo = getDebugInfo();
                if (!empty($debugInfo)) {
                    $response['debug'] = $debugInfo;
                }
            }
        }
    }

    // Set the HTTP header and JSON response
    header('Content-type: application/json', true, $httpResponseCode);
    echo json_encode($response);
}

processMail();

?>
