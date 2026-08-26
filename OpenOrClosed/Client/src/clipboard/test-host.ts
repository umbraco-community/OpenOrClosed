import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The least a controller needs to be constructed outside the backoffice. The translators only ever
 * touch their own argument - they consume no contexts - so none of this has to do real work.
 */
export function createTestHost(): UmbControllerHost {
    return {
        addUmbController() {},
        removeUmbController() {},
        getHostElement: () => undefined,
    } as unknown as UmbControllerHost;
}
