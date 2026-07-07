// Draait in pagina-context (niet isolated world) — onderschept XHR én form submits van GWT
(function () {
  const CONTACT_SAVE_PATH = '/rela.person/save';
  const AGENDA_TARGET = '/rela.agenda/searchAgendaDay';
  const TAXATIE_PATH = '/broker.taxatie/';
  const LEAD_RESPONSE_PATH = '/broker.response/save';
  const BACKUP_CAPTURE_MAX_CHARS = 200000;
  const BACKUP_CAPTURE_HOSTS = new Set(['backup.realworks.nl', 'crm.realworks.nl']);
  const BACKUP_CAPTURE_HINTS = [
    /correspond/i,
    /histor/i,
    /history/i,
    /mail/i,
    /email/i,
    /bericht/i,
    /message/i,
    /dossier/i,
    /timeline/i,
    /note/i,
    /memo/i,
    /rela\./i,
    /broker\./i,
    /api\/aankoop\/graphql/i,
    /servlets\/objects/i,
  ];
  const BACKUP_CAPTURE_STATIC = /\.(?:css|js|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)(?:[?#]|$)/i;
  const BACKUP_CAPTURE_TEXT = /(?:json|text|html|xml|javascript|x-www-form-urlencoded)/i;
  const SEARCHER_BULK_PAGE_SIZE = 100;
  const SEARCHER_BULK_MAX_SEARCHERS = 1000;
  const searcherBulkRuns = new Set();
  let origFetchForBulk = null;

  const GET_SEARCHER_BY_ID_QUERY = `query GetSearcherById($id: ID!, $locationPagination: InputPagination) {
  searchers(filters: {ids: [$id]}) {
    totalCount
    edges {
      id
      additionalEmail
      type
      projectCode
      status
      objectKind
      notes
      constructionType
      constructionYearFrom
      constructionYearTo
      houseTypes
      apartmentTypes
      energyLabelType
      outdoorAmenities
      gardenPositions
      objectTypes
      locationTypes
      parkingOption
      matchOnOwnObjects
      matchOnOtherObjects
      freqeuentieType
      departmentCode
      dateIn
      dateEnd
      dateLastChanged
      maintenanceLevelOutside
      maintenanceLevelInside
      doubleOccupancyPossible
      doubleOccupancy
      minimumMatchingPercentage
      sourceType
      reference
      suitableForDisabled
      suitableForElderly
      needsWorkHouse
      swimmingPool
      jacuzzi
      solarPanels
      groundOwnershipStatusTypes
      searchResultsFromDate
      department { id name __typename }
      accountManager { id name code type __typename }
      clients {
        id
        code
        name
        type
        notes
        privateNotes
        phoneNumbers { work home mobile __typename }
        emailAddresses
        moveAccountDetails { lastUpdate moveId relationSystemId __typename }
        addresses {
          home { street street2 houseNumber houseNumberExtension city __typename }
          __typename
        }
        __typename
      }
      hardSoftCriteria { criteriaName criteriaType __typename }
      locationFilters(pagination: $locationPagination) {
        totalCount
        edges { id displayName geometryRd type __typename }
        __typename
      }
      allLocInfo {
        areasLegacy { id name __typename }
        citiesLegacy { id name __typename }
        workingArea
        zipcodes { from to __typename }
        __typename
      }
      price { min max __typename }
      destination { permanentLiving recreationalLiving __typename }
      properties { livingSpaceFrom plotAreaFrom numOfRoomsFrom numOfBedroomsFrom __typename }
      accessibility { groundFloorBedroom groundFloorBathroom __typename }
      facilities { lift __typename }
      particulars { partiallyFurnished furnished upholstered __typename }
      courtage { amount payingClient percentage __typename }
      __typename
    }
    __typename
  }
}`;

  const GET_SEARCH_RESULTS_QUERY = `query GetSearchResults($filters: InputSearchResultFilters, $sort: InputSearchResultSort, $pagination: InputPagination) {
  searchResults(filters: $filters, sort: $sort, pagination: $pagination) {
    totalCount
    facets {
      status { name count __typename }
      moveActivities { name count __typename }
      __typename
    }
    edges {
      dateFound
      dateSent
      searchResultStatus
      matchingPercentage
      matchedSearchCriteria
      nonMatchedSearchCriteria
      dateViewed
      dateContactFormClicked
      isLiked
      exchangeObjectEntityType
      exchangeObjectId
      searchResultsId
      searcherId
      exchangeObject {
        description
        dateIn
        objectKind
        id
        sizeLivingSpace
        roomsTotal
        __typename
        ... on ExchangeObject {
          daysOnMarket
          exchangeOffice { id name number email phone __typename }
          objectStatus
          tiaraCode
          constructionYear
          energyLabel
          roomsBedroom
          sizePlotArea
          type
          viewingPlannerLink
          media { id mediaGroup url __typename }
          price {
            rentingPrice
            priceType
            rentingSuffix
            sellingSuffix
            rentingPrefix
            sellingPrefix
            sellingPrice
            serviceCosts
            __typename
          }
          __typename
        }
        address {
          description
          streetName
          houseNumber
          houseNumberExtension
          postCode
          neighbourhood
          district
          city
          municipality
          province
          __typename
        }
      }
      __typename
    }
    __typename
  }
}`;

  // Decoodeert een __MASK-waarde naar een leesbaar label
  // bv. maskString = "0;|1;Handmatig|2;Funda|6;Funda Lead", value = "6" → "Funda Lead"
  function decodeMask(value, maskString) {
    if (!maskString || value === undefined || value === null) return value;
    for (const entry of maskString.split('|')) {
      const sep = entry.indexOf(';');
      if (sep === -1) continue;
      const v = entry.slice(0, sep);
      const label = entry.slice(sep + 1);
      if (v === String(value)) return label;
    }
    return value;
  }

  function absoluteUrl(url) {
    try {
      return new URL(url, window.location.href);
    } catch {
      return null;
    }
  }

  function matchedCaptureHints(url) {
    return BACKUP_CAPTURE_HINTS
      .filter((pattern) => pattern.test(url))
      .map((pattern) => pattern.source);
  }

  function shouldCaptureRealworksNetwork(url, contentType) {
    const parsed = absoluteUrl(url);
    if (!parsed || !BACKUP_CAPTURE_HOSTS.has(parsed.hostname)) return false;
    if (BACKUP_CAPTURE_STATIC.test(parsed.pathname)) return false;

    if (parsed.hostname === 'backup.realworks.nl') {
      return !contentType || BACKUP_CAPTURE_TEXT.test(contentType);
    }

    return matchedCaptureHints(parsed.href).length > 0
      && (!contentType || BACKUP_CAPTURE_TEXT.test(contentType));
  }

  function bodyPreview(body) {
    if (!body) return '';
    if (typeof body === 'string') return body.slice(0, BACKUP_CAPTURE_MAX_CHARS);
    if (body instanceof URLSearchParams) return body.toString().slice(0, BACKUP_CAPTURE_MAX_CHARS);
    if (body instanceof FormData) {
      const fields = {};
      body.forEach((value, key) => {
        fields[key] = typeof value === 'string' ? value : `[file:${value?.name || 'unknown'}]`;
      });
      return JSON.stringify(fields).slice(0, BACKUP_CAPTURE_MAX_CHARS);
    }
    return '';
  }

  function decodeHtml(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value || '';
    return textarea.value;
  }

  function stripHtml(value) {
    const div = document.createElement('div');
    div.innerHTML = value || '';
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function parseRelationEntityFromGridRow(row) {
    const html = (row.columns || []).map((column) => column.content || '').join('\n');
    const decoded = decodeHtml(html);
    const entityMatch = decoded.match(/new Entity\("rela\.(?:relation|person)",\s*\d+,\s*(\{.*?\})\),\s*event/s);
    let entity = null;

    if (entityMatch) {
      try { entity = JSON.parse(entityMatch[1]); } catch {}
    }

    const nameMatch = decoded.match(/<a[^>]+onclick="openRelation\((\d+)\);"[^>]*>(.*?)<\/a>/s);
    const emailMatch = decoded.match(/GridUtils\.newMailUsingAddress\("([^"]+)"/);

    return {
      systemid: String(entity?.systemid || row.rowAttributes?.systemid || nameMatch?.[1] || ''),
      rcode: String(entity?.rcode || ''),
      rtype: String(entity?.rtype || row.rowAttributes?.rtype || ''),
      entityKey: row.rowAttributes?._entity_key || '',
      name: entity?.company
        || [entity?.title, entity?.firstname, entity?.middlename, entity?.lastname].filter(Boolean).join(' ')
        || stripHtml(nameMatch?.[2] || ''),
      email: entity?.email || emailMatch?.[1] || '',
      phone: entity?.tel1 || '',
      mobile: entity?.mobile || '',
      address: {
        street: entity?.hstreet || entity?.mstreet || entity?.ostreet || '',
        houseNumber: entity?.hhouseno || entity?.mhouseno || entity?.ohouseno || '',
        houseNumberAddition: entity?.hhousenoext || entity?.mhousenoext || entity?.ohousenoext || '',
        zipcode: entity?.hzipcode || entity?.mzipcode || entity?.ozipcode || '',
        city: entity?.hcity || entity?.mcity || entity?.ocity || '',
      },
      lastUpdated: entity?.rlastup || '',
      inactive: entity?.rinactive === true,
      alertnote: entity?.alertnote || '',
    };
  }

  function parseRelationGrid(responseText) {
    let rows;
    try { rows = JSON.parse(responseText); } catch { return null; }
    if (!Array.isArray(rows)) return null;

    return rows
      .map(parseRelationEntityFromGridRow)
      .filter((row) => row.systemid || row.rcode || row.email || row.name);
  }

  function valueFromBodyPreview(body, key) {
    if (!body) return '';
    try {
      const params = new URLSearchParams(body);
      return params.get(key) || '';
    } catch {
      const match = String(body).match(new RegExp(`${key}=([^&]+)`));
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
    }
  }

  function parseKadasterText(rawText) {
    const text = stripHtml(rawText || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const sizeMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²|ha|are|ca)/i);
    const parts = text
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:m2|m²|ha|are|ca)/ig, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const sectionIndex = parts.findIndex((part) => /^[A-Z]{1,3}$/i.test(part));

    if (sectionIndex <= 0 || !parts[sectionIndex + 1]) {
      return { rawText: text };
    }

    return {
      gemeente: parts.slice(0, sectionIndex).join(' '),
      sectie: parts[sectionIndex].toUpperCase(),
      nummer: parts[sectionIndex + 1],
      grootteM2: sizeMatch?.[1]?.replace(',', '.') || '',
      rawText: text,
    };
  }

  function parseKadasterGrid(responseText) {
    let rows;
    try { rows = JSON.parse(responseText); } catch { return null; }
    if (!Array.isArray(rows)) return null;

    return rows
      .map((row) => {
        const columns = row.columns || [];
        const kadasterText = stripHtml(columns[1]?.content || '');
        const eigendomssituatie = stripHtml(columns[2]?.content || '');
        const parsed = parseKadasterText(kadasterText || columns.map((column) => column.content || '').join(' '));
        if (!parsed?.rawText) return null;
        return {
          ...parsed,
          eigendomssituatie,
          rowSystemid: String(row.rowAttributes?.systemid || row.rowAttributes?._systemid || ''),
        };
      })
      .filter(Boolean);
  }

  function postKadasterGridCapture(capture, responseText) {
    if (!capture.url?.includes('/broker.brokerobject/grid')) return;
    const request = capture.request_body_preview || '';
    if (!request.includes('_entity=broker.kadaster') && !request.includes('getKadasterForGrid')) return;

    const rows = parseKadasterGrid(responseText);
    if (!rows?.length) return;

    window.postMessage({
      type: 'REALWORKS_KADASTER_GRID',
      data: {
        realworksSystemId: valueFromBodyPreview(request, '_systemid'),
        rows,
        url: capture.url,
      },
    }, '*');
  }

  function postRelationGridCapture(capture, responseText) {
    if (!capture.url?.includes('/rela.relation/grid')) return;

    const relationGridRows = parseRelationGrid(responseText);
    if (!relationGridRows?.length) return;

    postNetworkCapture({
      source: 'realworks_relation_grid',
      transport: capture.transport,
      method: capture.method,
      url: capture.url,
      status: capture.status,
      content_type: capture.content_type,
      request_body_preview: JSON.stringify({
        request: capture.request_body_preview || '',
        count: relationGridRows.length,
        rows: relationGridRows,
      }).slice(0, BACKUP_CAPTURE_MAX_CHARS),
      response_truncated: false,
      response_body: '',
    });
  }

  function postSearchersGraphqlCapture(capture, responseText) {
    if (!capture.url?.includes('/api/aankoop/graphql')) return;
    if (!capture.request_body_preview?.match(/"operationName":"(GetSearchers|GetSearcherById|GetSearchResults)"/)) return;

    let response = null;
    try { response = JSON.parse(responseText); } catch { return; }
    let request = capture.request_body_preview || '';
    try { request = JSON.parse(capture.request_body_preview); } catch {}
    const operationName = request?.operationName || 'UnknownGraphqlOperation';

    const searchers = response?.data?.searchers;
    const searcher = response?.data?.searcher || response?.data?.searcherById;
    const searchResults = response?.data?.searchResults;
    const searcherEdges = Array.isArray(searchers?.edges) ? searchers.edges : [];
    const resultEdges = Array.isArray(searchResults?.edges) ? searchResults.edges : [];
    if (!searcherEdges.length && !resultEdges.length && !searcher && searchers?.totalCount == null) return;

    postNetworkCapture({
      source: operationName === 'GetSearchResults'
        ? 'realworks_search_results_graphql_original'
        : operationName === 'GetSearcherById'
          ? 'realworks_searcher_detail_graphql_original'
          : 'realworks_searchers_graphql_original',
      transport: capture.transport,
      method: capture.method,
      url: capture.url,
      status: capture.status,
      content_type: capture.content_type,
      request_body_preview: JSON.stringify({
        totalCount: searchers?.totalCount ?? null,
        resultTotalCount: searchResults?.totalCount ?? null,
        count: searcherEdges.length || resultEdges.length || (searcher ? 1 : 0),
        searchers: searcher ? [searcher] : searcherEdges,
        results: resultEdges,
        request,
      }).slice(0, BACKUP_CAPTURE_MAX_CHARS),
      response_truncated: responseText.length > BACKUP_CAPTURE_MAX_CHARS,
      response_body: '',
    });

    if (operationName === 'GetSearchers' && searchers?.totalCount > 0 && searcherEdges.length) {
      queueBulkSearchers(capture.url, request, response);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function searcherIdFromItem(item) {
    const searcher = item?.node || item || {};
    return searcher.id ? String(searcher.id) : '';
  }

  async function getPageApiToken() {
    if (!origFetchForBulk) throw new Error('Originele fetch niet beschikbaar');
    const res = await origFetchForBulk('/apitoken/', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    const text = (await res.text()).trim();
    let token = text.replace(/^"|"$/g, '');
    try {
      const json = JSON.parse(text);
      token = json.token || json.accessToken || json.apiToken || json.jwt || token;
    } catch {}
    if (!token || token.length < 20) throw new Error('/apitoken/ gaf geen bruikbaar token');
    return token;
  }

  async function bulkGraphql(url, payload, token) {
    if (!origFetchForBulk) throw new Error('Originele fetch niet beschikbaar');
    const res = await origFetchForBulk(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/graphql-response+json,application/json;q=0.9',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return {
      status: res.status,
      contentType: res.headers?.get('content-type') || '',
      text,
      data,
    };
  }

  function postBulkGraphqlCapture(url, operationName, request, result) {
    const data = result.data;
    const searchers = data?.data?.searchers;
    const searcher = data?.data?.searcher || data?.data?.searcherById;
    const searchResults = data?.data?.searchResults;
    const searcherEdges = Array.isArray(searchers?.edges) ? searchers.edges : [];
    const resultEdges = Array.isArray(searchResults?.edges) ? searchResults.edges : [];

    postNetworkCapture({
      source: operationName === 'GetSearchResults'
        ? 'realworks_search_results_graphql_bulk'
        : operationName === 'GetSearcherById'
          ? 'realworks_searcher_detail_graphql_bulk'
          : 'realworks_searchers_graphql_bulk',
      transport: 'page_bulk_graphql',
      method: 'POST',
      url,
      status: result.status,
      content_type: result.contentType,
      request_body_preview: JSON.stringify({
        totalCount: searchers?.totalCount ?? null,
        resultTotalCount: searchResults?.totalCount ?? null,
        count: searcherEdges.length || resultEdges.length || (searcher ? 1 : 0),
        searchers: searcher ? [searcher] : searcherEdges,
        results: resultEdges,
        request,
      }).slice(0, BACKUP_CAPTURE_MAX_CHARS),
      response_truncated: result.text.length > BACKUP_CAPTURE_MAX_CHARS,
      response_body: searcherEdges.length || resultEdges.length || searcher ? '' : result.text.slice(0, BACKUP_CAPTURE_MAX_CHARS),
    });
  }

  function queueBulkSearchers(url, originalRequest, originalResponse) {
    const filters = originalRequest?.variables?.filters || {};
    const sort = originalRequest?.variables?.sort || {};
    const key = JSON.stringify({ filters, sort });
    if (searcherBulkRuns.has(key)) return;
    searcherBulkRuns.add(key);
    setTimeout(() => searcherBulkRuns.delete(key), 15 * 60_000);

    runBulkSearchers(url, originalRequest, originalResponse).catch((error) => {
      console.warn('[RW Searchers Bulk] Mislukt:', error);
    });
  }

  async function runBulkSearchers(url, originalRequest, originalResponse) {
    const token = await getPageApiToken();
    const total = Number(originalResponse?.data?.searchers?.totalCount || 0);
    const maxSearchers = Math.min(total || SEARCHER_BULK_PAGE_SIZE, SEARCHER_BULK_MAX_SEARCHERS);
    const totalPages = Math.max(1, Math.ceil(maxSearchers / SEARCHER_BULK_PAGE_SIZE));
    const ids = [];

    console.log(`[RW Searchers Bulk] Start: ${maxSearchers}/${total || '?'} zoekers`);

    for (let page = 1; page <= totalPages; page += 1) {
      const listRequest = {
        ...originalRequest,
        variables: {
          ...(originalRequest.variables || {}),
          pagination: { page, size: SEARCHER_BULK_PAGE_SIZE },
        },
      };
      const listResult = await bulkGraphql(url, listRequest, token);
      postBulkGraphqlCapture(url, 'GetSearchers', listRequest, listResult);
      const edges = listResult.data?.data?.searchers?.edges || [];
      for (const edge of edges) {
        const id = searcherIdFromItem(edge);
        if (id && !ids.includes(id)) ids.push(id);
      }
      await sleep(250);
    }

    for (const id of ids.slice(0, SEARCHER_BULK_MAX_SEARCHERS)) {
      const detailRequest = {
        operationName: 'GetSearcherById',
        variables: { id, locationPagination: { page: 1, size: 100 } },
        extensions: originalRequest.extensions,
        query: GET_SEARCHER_BY_ID_QUERY,
      };
      const detailResult = await bulkGraphql(url, detailRequest, token);
      postBulkGraphqlCapture(url, 'GetSearcherById', detailRequest, detailResult);
      await sleep(200);

      let resultPage = 1;
      let resultTotalPages = 1;
      do {
        const resultsRequest = {
          operationName: 'GetSearchResults',
          variables: {
            filters: { dateRange: null, dateSent: null, searcherId: Number(id) || id },
            sort: { field: 'DATE_FOUND', order: 'DESC' },
            pagination: { page: resultPage, size: SEARCHER_BULK_PAGE_SIZE },
          },
          extensions: originalRequest.extensions,
          query: GET_SEARCH_RESULTS_QUERY,
        };
        const resultsResult = await bulkGraphql(url, resultsRequest, token);
        postBulkGraphqlCapture(url, 'GetSearchResults', resultsRequest, resultsResult);
        const resultTotal = Number(resultsResult.data?.data?.searchResults?.totalCount || 0);
        resultTotalPages = Math.max(1, Math.ceil(Math.min(resultTotal, 500) / SEARCHER_BULK_PAGE_SIZE));
        resultPage += 1;
        await sleep(250);
      } while (resultPage <= resultTotalPages);
    }

    console.log(`[RW Searchers Bulk] Klaar: ${ids.length} zoekers verwerkt`);
  }

  function formFieldsPreview(form) {
    const fields = {};
    try {
      for (const element of Array.from(form.elements || [])) {
        const name = element?.name;
        if (!name) continue;

        const type = String(element.type || '').toLowerCase();
        if (type === 'password' || type === 'file') {
          fields[name] = `[${type}]`;
          continue;
        }
        if ((type === 'checkbox' || type === 'radio') && !element.checked) continue;

        fields[name] = element.value ?? '';
      }
    } catch {}

    return JSON.stringify(fields).slice(0, BACKUP_CAPTURE_MAX_CHARS);
  }

  function postNetworkCapture(capture) {
    const parsed = absoluteUrl(capture.url);
    if (!parsed) return;

    window.postMessage({
      type: 'REALWORKS_BACKUP_NETWORK',
      capture: {
        source: 'realworks_network_capture',
        captured_at: new Date().toISOString(),
        host: parsed.hostname,
        path: parsed.pathname,
        query: parsed.search,
        hints: matchedCaptureHints(parsed.href),
        ...capture,
      },
    }, '*');
  }

  function postPopupCapture(capture) {
    const parsed = absoluteUrl(capture.url);

    window.postMessage({
      type: 'REALWORKS_BACKUP_NETWORK',
      capture: {
        source: 'realworks_popup_capture',
        captured_at: new Date().toISOString(),
        host: parsed?.hostname || window.location.hostname,
        path: parsed?.pathname || '',
        query: parsed?.search || '',
        hints: matchedCaptureHints(capture.url || ''),
        page_url: window.location.href,
        ...capture,
      },
    }, '*');
  }

  function postFormCapture(form, trigger) {
    if (!form) return;

    const action = form.getAttribute('action');
    const url = action && action !== 'null'
      ? (absoluteUrl(action)?.href || action)
      : window.location.href;

    if (!shouldCaptureRealworksNetwork(url, 'application/x-www-form-urlencoded')) return;

    postPopupCapture({
      source: 'realworks_form_capture',
      transport: 'form_submit',
      method: String(form.method || 'GET').toUpperCase(),
      url,
      status: null,
      content_type: form.enctype || 'application/x-www-form-urlencoded',
      form_target: form.target || '',
      form_name: form.getAttribute('name') || '',
      form_id: form.id || '',
      form_trigger: trigger,
      request_body_preview: formFieldsPreview(form),
      response_truncated: false,
      response_body: '',
    });
  }

  // Extraheert kwalificatiedata uit broker.response formuliervelden
  function extractLeadResponse(data) {
    return {
      systemid: data['_systemid'],
      resprcode: data['resprcode'],        // Realworks contactcode van de kijker
      rlisnr: data['rlisnr'],              // Objectcode (bijv. SE11845)
      contact: {
        voornaam: data['rfirstname'] || '',
        achternaam: data['rlastname'] || '',
        email: data['remail'] || '',
        telefoon: data['rtel1'] || data['rmobile'] || '',
      },
      lead: {
        herkomstCode: data['leadorigin'],
        herkomst: decodeMask(data['leadorigin'], data['leadorigin__MASK']),
        labelCode: data['leadlabel'],
        label: decodeMask(data['leadlabel'], data['leadlabel__MASK']),
        statusCode: data['leadstatus'],
        status: decodeMask(data['leadstatus'], data['leadstatus__MASK']),
      },
      // Kwalificatievragen over de kijker — voor AI-profiel en bezichtiging-prep
      kwalificatie: {
        aanvragerTypeCode: data['viewerapplicanttype'],
        aanvragerType: decodeMask(data['viewerapplicanttype'], data['viewerapplicanttype__MASK']),
        heeftEigenWoning: data['viewerhasowneroccupiedhome'] === '1',
        overwegtVerkoopWoning: data['viewerconsideringsellinghome'] === '1',
        hypotheekAdviesStatusCode: data['viewermortgageadvicestatus'],
        hypotheekAdviesStatus: decodeMask(data['viewermortgageadvicestatus'], data['viewermortgageadvicestatus__MASK']),
      },
      memo: {
        intern: data['rmemoint'] || '',    // Interne notities (wachtlijst etc.)
        publiek: data['rmemopro'] || '',   // Afspraakvoors­tellen + opmerkingen kijker
      },
      makelaarCode: data['accmanager'],
    };
  }

  // ── Formulier-submit interceptie ─────────────────────────────────────────────
  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (!form || !form.action) return;

    let actionPath;
    try { actionPath = new URL(form.action).pathname; } catch { return; }

    postFormCapture(form, 'submit_event');

    if (actionPath.includes(CONTACT_SAVE_PATH)) {
      try {
        const data = {};
        new FormData(form).forEach((value, key) => {
          if (typeof value === 'string') data[key] = value;
        });

        if (!data['_systemid']) return;

        window.postMessage({ type: 'REALWORKS_CONTACT', data, url: actionPath }, '*');
        window.postMessage({
          type: 'REALWORKS_CONTACT_RAW',
          systemid: data['_systemid'],
          fields: data,
          isMultipart: form.enctype === 'multipart/form-data',
          url: actionPath,
        }, '*');
      } catch {}
      return;
    }

    if (actionPath.includes(LEAD_RESPONSE_PATH)) {
      try {
        const data = {};
        new FormData(form).forEach((value, key) => {
          if (typeof value === 'string') data[key] = value;
        });

        if (!data['_systemid']) return;

        window.postMessage({
          type: 'REALWORKS_LEAD_RESPONSE',
          data: extractLeadResponse(data),
          url: actionPath,
        }, '*');
      } catch {}
      return;
    }

    if (actionPath.includes(TAXATIE_PATH)) {
      try {
        const data = {};
        new FormData(form).forEach((value, key) => {
          if (typeof value === 'string') data[key] = value;
        });

        if (!data['_systemid']) return;

        window.postMessage({ type: 'REALWORKS_TAXATIE', data, url: actionPath }, '*');
        window.postMessage({
          type: 'REALWORKS_TAXATIE_RAW',
          systemid: data['_systemid'],
          fields: data,
          isMultipart: form.enctype === 'multipart/form-data',
          url: actionPath,
        }, '*');
      } catch {}
    }
  }, true);

  document.addEventListener('click', function (e) {
    const anchor = e.target?.closest?.('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';
    const onclick = anchor.getAttribute('onclick') || '';
    const target = anchor.getAttribute('target') || '';
    const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
    const url = absoluteUrl(href)?.href || href;

    if (
      target ||
      /window\.open|popup|openWindow|showmodal|showModal|modify|view|details?/i.test(onclick) ||
      /modify|view|details?|download|letter|email|mail|correspond/i.test(url)
    ) {
      postPopupCapture({
        transport: 'anchor_click',
        method: 'GET',
        url,
        status: null,
        content_type: '',
        link_text: text,
        link_target: target,
        onclick_preview: onclick.slice(0, 2000),
        request_body_preview: '',
        response_truncated: false,
        response_body: '',
      });
    }
  }, true);

  // ── HTMLFormElement.prototype.submit override ─────────────────────────────────
  // GWT roept form.submit() programmatisch aan — dat triggert geen 'submit'-event.
  const origFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (this.action) {
      let actionPath;
      try { actionPath = new URL(this.action).pathname; } catch { return origFormSubmit.call(this); }

      postFormCapture(this, 'prototype_submit');

      if (actionPath.includes(LEAD_RESPONSE_PATH)) {
        try {
          const data = {};
          new FormData(this).forEach((value, key) => {
            if (typeof value === 'string') data[key] = value;
          });
          if (data['_systemid']) {
            window.postMessage({
              type: 'REALWORKS_LEAD_RESPONSE',
              data: extractLeadResponse(data),
              url: actionPath,
            }, '*');
          }
        } catch {}
      }

      if (actionPath.includes(TAXATIE_PATH)) {
        try {
          const data = {};
          new FormData(this).forEach((value, key) => {
            if (typeof value === 'string') data[key] = value;
          });
          if (data['_systemid']) {
            window.postMessage({ type: 'REALWORKS_TAXATIE', data, url: actionPath }, '*');
            window.postMessage({
              type: 'REALWORKS_TAXATIE_RAW',
              systemid: data['_systemid'],
              fields: data,
              isMultipart: this.enctype === 'multipart/form-data',
              url: actionPath,
            }, '*');
          }
        } catch {}
      }
    }
    return origFormSubmit.call(this);
  };

  // ── XHR interceptie ──────────────────────────────────────────────────────────
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OrigXHR();
    let _method = 'GET';
    let _url = '';
    let _body = null;

    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      _method = method;
      _url = url;
      return origOpen(method, url, ...rest);
    };

    const origSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      _body = body;

      xhr.addEventListener('load', function () {
        const contentType = xhr.getResponseHeader?.('content-type') || '';

        let responseText = '';
        try {
          responseText = typeof xhr.responseText === 'string' ? xhr.responseText : '';
        } catch {}

        postRelationGridCapture({
          transport: 'xhr_grid_parse',
          method: _method,
          url: _url,
          status: xhr.status,
          content_type: contentType,
          request_body_preview: bodyPreview(_body),
        }, responseText);

        postSearchersGraphqlCapture({
          transport: 'xhr_graphql_parse',
          method: _method,
          url: _url,
          status: xhr.status,
          content_type: contentType,
          request_body_preview: bodyPreview(_body),
        }, responseText);

        postKadasterGridCapture({
          transport: 'xhr_kadaster_grid_parse',
          method: _method,
          url: _url,
          status: xhr.status,
          content_type: contentType,
          request_body_preview: bodyPreview(_body),
        }, responseText);

        if (!shouldCaptureRealworksNetwork(_url, contentType)) return;

        postNetworkCapture({
          transport: 'xhr',
          method: _method,
          url: _url,
          status: xhr.status,
          content_type: contentType,
          request_body_preview: bodyPreview(_body),
          response_truncated: responseText.length > BACKUP_CAPTURE_MAX_CHARS,
          response_body: responseText.slice(0, BACKUP_CAPTURE_MAX_CHARS),
        });
      });

      if (_method === 'POST' && _url.includes(CONTACT_SAVE_PATH) && body) {
        xhr.addEventListener('load', function () {
          if (xhr.status === 200) {
            try {
              const data = {};
              if (body instanceof FormData) {
                body.forEach((value, key) => {
                  if (typeof value === 'string') data[key] = value;
                });
              } else {
                new URLSearchParams(body).forEach((v, k) => { data[k] = v; });
              }
              for (const [key, value] of Object.entries({ ...data })) {
                const mask = data[`${key}__MASK`];
                if (mask && value !== '') data[`${key}_label`] = decodeMask(value, mask);
              }
              window.postMessage({ type: 'REALWORKS_CONTACT', data, url: _url }, '*');
            } catch {}
          }
        });
      }

      if (_method === 'POST' && _url.includes(TAXATIE_PATH) && body) {
        // Grid-calls (sub-tabellen die bij paginaload vuren) overslaan
        const bodyStr = typeof body === 'string' ? body : '';
        const isGridCall = bodyStr.includes('_dispatcher=gwt_json') || _url.includes('/grid');
        if (!isGridCall) {
          xhr.addEventListener('load', function () {
            if (xhr.status === 200) {
              try {
                const data = {};
                if (body instanceof FormData) {
                  body.forEach((value, key) => {
                    if (typeof value === 'string') data[key] = value;
                  });
                } else {
                  new URLSearchParams(body).forEach((v, k) => { data[k] = v; });
                }
                window.postMessage({ type: 'REALWORKS_TAXATIE', data, url: _url }, '*');
              } catch {}
            }
          });
        }
      }

      if (_method === 'POST' && _url.includes(AGENDA_TARGET)) {
        xhr.addEventListener('load', function () {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              const params = _body ? new URLSearchParams(_body) : new URLSearchParams();
              const meta = {
                fromdate: params.get('fromdate'),
                todate: params.get('todate'),
                employees: params.get('employees'),
              };
              window.postMessage({ type: 'REALWORKS_AGENDA', data: response, meta, url: _url }, '*');
            } catch {}
          }
        });
      }

      return origSend(body);
    };

    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;

  const origWindowOpen = window.open;
  window.open = function (url, target, features) {
    const resolvedUrl = url ? (absoluteUrl(url)?.href || String(url)) : '';
    postPopupCapture({
      transport: 'window_open',
      method: 'GET',
      url: resolvedUrl,
      status: null,
      content_type: '',
      popup_target: target || '',
      popup_features: features || '',
      request_body_preview: '',
      response_truncated: false,
      response_body: '',
    });

    return origWindowOpen.apply(this, arguments);
  };

  const origFetch = window.fetch;
  origFetchForBulk = origFetch?.bind(window);
  if (typeof origFetch === 'function') {
    window.fetch = async function (input, init) {
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : String(input);
      const method = (init?.method || request?.method || 'GET').toUpperCase();
      let requestBody = init?.body || null;
      if (!requestBody && request) {
        try { requestBody = await request.clone().text(); } catch {}
      }

      const response = await origFetch.apply(this, arguments);
      const contentType = response.headers?.get('content-type') || '';

      if (shouldCaptureRealworksNetwork(url, contentType) || url.includes('/rela.relation/grid')) {
        response.clone().text().then((text) => {
          const requestBodyPreview = bodyPreview(requestBody);
          postRelationGridCapture({
            transport: 'fetch_grid_parse',
            method,
            url,
            status: response.status,
            content_type: contentType,
            request_body_preview: requestBodyPreview,
          }, text);

          postSearchersGraphqlCapture({
            transport: 'fetch_graphql_parse',
            method,
            url,
            status: response.status,
            content_type: contentType,
            request_body_preview: requestBodyPreview,
          }, text);

          if (!shouldCaptureRealworksNetwork(url, contentType)) return;

          postNetworkCapture({
            transport: 'fetch',
            method,
            url,
            status: response.status,
            content_type: contentType,
            request_body_preview: requestBodyPreview,
            response_truncated: text.length > BACKUP_CAPTURE_MAX_CHARS,
            response_body: text.slice(0, BACKUP_CAPTURE_MAX_CHARS),
          });
        }).catch(() => {});
      }

      return response;
    };
  }
})();
