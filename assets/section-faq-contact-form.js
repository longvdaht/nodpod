(function () {
  function val(form, name) {
    var el = form.elements[name];
    return el ? (el.value || '').trim() : '';
  }

  function selectedText(form, name) {
    var el = form.elements[name];
    if (!el || !el.selectedOptions || !el.selectedOptions[0]) return '';
    return el.selectedOptions[0].text;
  }

  function showErrors(errorsEl, list) {
    errorsEl.innerHTML = '';
    list.forEach(function (msg) {
      var li = document.createElement('li');
      li.textContent = msg;
      errorsEl.appendChild(li);
    });
    errorsEl.hidden = false;
    errorsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function init(form) {
    if (form.dataset.fcfBound) return;
    form.dataset.fcfBound = '1';

    var successEl = form.querySelector('.fcf-success');
    var errorsEl = form.querySelector('.fcf-errors');
    var submitBtn = form.querySelector('.fcf-submit');
    var fieldsEl = form.querySelector('.fcf-fields');

    function complete() {
      fieldsEl.hidden = true;
      submitBtn.hidden = true;
      successEl.hidden = false;
      successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorsEl.hidden = true;

      // Honeypot: silently succeed for bots
      if (val(form, 'website')) {
        complete();
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var d = form.dataset;
      var first = val(form, 'first_name');
      var last = val(form, 'last_name');
      var orderNumber = val(form, 'order_number');

      var body =
        'Reason for contact: ' + selectedText(form, 'reason') + '\n' +
        'Name: ' + first + ' ' + last + '\n' +
        'Email: ' + val(form, 'email') + '\n' +
        'Order Number: ' + (orderNumber || '(none)') + '\n\n' +
        'Message:\n' + val(form, 'message');

      var customFields = [
        { id: Number(d.fidReason), value: val(form, 'reason') },
        { id: Number(d.fidFirstName), value: first },
        { id: Number(d.fidLastName), value: last },
        { id: Number(d.fidEmail), value: val(form, 'email') }
      ];
      if (orderNumber) {
        customFields.push({ id: Number(d.fidOrderNumber), value: orderNumber });
      }

      var payload = {
        request: {
          subject: 'Contact form: ' + selectedText(form, 'reason'),
          comment: { body: body },
          requester: { name: (first + ' ' + last).trim(), email: val(form, 'email') },
          ticket_form_id: Number(d.ticketFormId),
          custom_fields: customFields
        }
      };

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      fetch(d.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) { throw new Error('Request failed (' + res.status + ')'); }
          return res.json();
        })
        .then(complete)
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit';
          showErrors(errorsEl, [
            'Something went wrong sending your message. Please try again, or email hello@nodpod.com directly.'
          ]);
        });
    });
  }

  function boot() {
    document.querySelectorAll('form[data-fcf]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
