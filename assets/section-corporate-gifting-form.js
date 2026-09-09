(function () {
  function val(form, name) {
    var el = form.elements[name];
    return el ? (el.value || '').trim() : '';
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
    if (form.dataset.cgfBound) return;
    form.dataset.cgfBound = '1';

    var successEl = form.querySelector('.cgf-success');
    var errorsEl = form.querySelector('.cgf-errors');
    var submitBtn = form.querySelector('.cgf-submit');
    var fieldsEl = form.querySelector('.cgf-fields');

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
      var shippingOption = form.elements['shipping'].selectedOptions[0];

      var body =
        'Name: ' + first + ' ' + last + '\n' +
        'Email: ' + val(form, 'email') + '\n' +
        'Company: ' + val(form, 'company') + '\n' +
        'Quantity Requested: ' + val(form, 'quantity') + '\n' +
        'Desired Delivery: ' + val(form, 'delivery') + '\n' +
        'Which products are you interested in?: ' + val(form, 'products') + '\n' +
        'Interested in selecting colors?: ' + val(form, 'colors') + '\n' +
        'Shipping: ' + (shippingOption ? shippingOption.text : '') + '\n\n' +
        'Anything else to add?:\n' + (val(form, 'notes') || '(none)');

      var payload = {
        request: {
          subject: 'Corporate Gifting Request — ' + val(form, 'company'),
          comment: { body: body },
          requester: { name: (first + ' ' + last).trim(), email: val(form, 'email') },
          ticket_form_id: Number(d.ticketFormId),
          custom_fields: [
            { id: Number(d.fidFirstName), value: first },
            { id: Number(d.fidLastName), value: last },
            { id: Number(d.fidEmail), value: val(form, 'email') },
            { id: Number(d.fidCompany), value: val(form, 'company') },
            { id: Number(d.fidQuantity), value: val(form, 'quantity') },
            { id: Number(d.fidDelivery), value: val(form, 'delivery') },
            { id: Number(d.fidProducts), value: val(form, 'products') },
            { id: Number(d.fidColors), value: val(form, 'colors') },
            { id: Number(d.fidShipping), value: val(form, 'shipping') }
          ]
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
            'Something went wrong sending your request. Please try again, or email concierge@nodpod.com directly.'
          ]);
        });
    });
  }

  function boot() {
    document.querySelectorAll('form[data-cgf]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
